import { existsSync } from 'node:fs'
import { join } from 'node:path'
import {
  type Conformance,
  type Finding,
  buildConformance,
  buildWorkingGraph,
  collectNewCoupling,
  computeAffectedNodeIds,
  computeFindingsDelta,
  computeGraphDelta,
  isFindingInScope,
  loadGraphBaseline,
  parseDiffText,
  parseGitNameStatus,
  resolveProjectRoot,
  runGitDiff,
} from '@codearch/core'
import { defineCommand } from 'citty'
import { createCliLogger } from '../logger.js'
import { appendActivityEntry, buildHookActivityEntry } from './hook-activity.js'
import { formatHookOutput, formatValidateDiffResult } from './validate-diff-format.js'

export interface RunValidateDiffOptions {
  projectRoot: string
  workingFiles?: string[]
  diff?: string
  /** git ref to diff against (default: HEAD). Ignored when workingFiles or diff is set. */
  against?: string
  /** Treat every newViolation as effective mode 'enforce' (alias: --mode enforce). */
  enforce?: boolean
  /** Global mode override; takes precedence over metadata.mode. */
  mode?: 'advisory' | 'warn' | 'enforce'
}

export type RunValidateDiffResult =
  | {
      status: 'ok'
      verdict: 'ok' | 'warn' | 'violation'
      newViolations: Finding[]
      removedViolations: Finding[]
      newFindings: Finding[]
      removedFindings: Finding[]
      exitCode: 0 | 1
      conformance?: Conformance
    }
  | { status: 'error'; error: string }

/**
 * Pure runner — exported for tests. The CLI command wraps this.
 *
 * Loads baseline.json, resolves changed-file set (explicit workingFiles, parsed
 * diff text, or git diff HEAD), builds a working graph, computes new/removed
 * findings, splits them by domain (rule → newViolations, else → newFindings),
 * and derives a verdict using the rule findings' metadata.mode.
 *
 * Verdict semantics — effective mode precedence: opts.enforce > opts.mode > metadata.mode (fallback 'advisory'):
 * - violation: any newViolations with effective mode 'enforce' OR any newFindings.severity === 'high'
 * - warn: any newViolations with effective mode 'warn' OR any newFindings.length > 0
 * - ok: otherwise
 *
 * Note: unlike the MCP tool (where per-rule metadata.mode wins over input mode), the CLI
 * intentionally inverts the precedence so --mode / --enforce act as global human/CI overrides.
 */
export async function runValidateDiff(
  opts: RunValidateDiffOptions,
): Promise<RunValidateDiffResult> {
  const baseline = await loadGraphBaseline(opts.projectRoot)
  if (!baseline) {
    return {
      status: 'error',
      error:
        'NO_BASELINE: No baseline at .vibegraph/cache/baseline.json. Run `vibe-graph baseline` first.',
    }
  }

  let changedFiles: string[]
  let deletedFiles: string[]
  if (opts.workingFiles !== undefined) {
    changedFiles = opts.workingFiles
    deletedFiles = []
  } else if (opts.diff !== undefined) {
    const parsed = parseDiffText(opts.diff)
    changedFiles = [...parsed.added, ...parsed.modified, ...parsed.renamed.map((r) => r.to)]
    deletedFiles = parsed.deleted
  } else {
    const ref = opts.against ?? 'HEAD'
    try {
      const out = await runGitDiff(opts.projectRoot, ref)
      ;({ changedFiles, deletedFiles } = parseGitNameStatus(out))
    } catch (err) {
      return {
        status: 'error',
        error: `GIT_NOT_AVAILABLE: Could not run git diff in ${opts.projectRoot}: ${(err as Error).message}. Pass --working-files or --diff explicitly.`,
      }
    }
  }

  const working = await buildWorkingGraph({
    projectRoot: opts.projectRoot,
    changedFiles,
    deletedFiles,
  })

  // Compute findings delta via the shared @codearch/core helper
  const { newFindings: newAll, removedFindings: removedAll } = computeFindingsDelta(
    baseline.findings,
    working.findings,
  )

  // Scope to "things touched by THIS diff" — see MCP validate-diff for the
  // same rationale (dogfooding Task 1 + Task 2 caught false-positive
  // removedViolations for unrelated files).
  //
  // Pass baseline + working edges so newly-added/renamed files (absent from
  // baseline `contains` edges) are still mapped to their owning subsystem via
  // the working scan's `contains` edges. See Fix 1.
  const affectedNodeIds = computeAffectedNodeIds(
    [...baseline.edges, ...working.edges],
    changedFiles,
    deletedFiles,
  )
  const inScope = (f: Finding) => isFindingInScope(f, affectedNodeIds)

  const newViolations = newAll.filter((f) => f.domain === 'rule').filter(inScope)
  const removedViolations = removedAll.filter((f) => f.domain === 'rule').filter(inScope)
  const newFindings = newAll.filter((f) => f.domain !== 'rule').filter(inScope)
  const removedFindings = removedAll.filter((f) => f.domain !== 'rule').filter(inScope)

  const graphDelta = computeGraphDelta(baseline, working)
  // Coupling is determined solely by isRuntimeCouplingEdge — type-only edges never
  // appear as new-coupling. `undeclared` drift findings are NOT counted as coupling.
  const newCoupling = collectNewCoupling(graphDelta, affectedNodeIds)
  const allNewFindings = [...newFindings, ...newCoupling]
  const conformance = buildConformance(allNewFindings, newViolations)

  const verdict = computeVerdict({
    newViolations,
    newFindings: allNewFindings,
    mode: opts.mode,
    enforce: opts.enforce,
  })
  const exitCode: 0 | 1 = verdict === 'violation' ? 1 : 0

  return {
    status: 'ok',
    verdict,
    newViolations,
    removedViolations,
    newFindings: allNewFindings,
    removedFindings,
    exitCode,
    conformance,
  }
}

/** Exported for unit-testing mode/enforce precedence logic in isolation. */
export function computeVerdict(opts: {
  newViolations: Finding[]
  newFindings: Finding[]
  mode?: 'advisory' | 'warn' | 'enforce'
  enforce?: boolean
}): 'ok' | 'warn' | 'violation' {
  const raw = computeRawVerdict(opts)
  // Advisory mode globally caps the verdict at 'warn' — findings remain in the
  // output but never trigger exit 1. Required so hooks/CI invoked with
  // --advisory (or --mode advisory) stay non-blocking even when non-rule
  // high-severity findings (e.g. new architectural cycles from detectors)
  // appear. Without this clamp, --advisory only suppressed rule-violation
  // escalation but high newFindings still escaped to exit 1.
  if (opts.mode === 'advisory' && raw === 'violation') return 'warn'
  return raw
}

/**
 * Exit code for the validate-diff command. In --hook mode it is ALWAYS 0 — a
 * PostToolUse hook must never block the agent's edit loop. Otherwise it reflects
 * the failure/verdict exit code.
 */
export function resolveExitCode(opts: { hook: boolean; failureExit: 0 | 1 }): 0 | 1 {
  return opts.hook ? 0 : opts.failureExit
}

function computeRawVerdict(opts: {
  newViolations: Finding[]
  newFindings: Finding[]
  mode?: 'advisory' | 'warn' | 'enforce'
  enforce?: boolean
}): 'ok' | 'warn' | 'violation' {
  // Effective mode for a violation: --enforce > --mode > metadata.mode (fallback 'advisory')
  const effectiveMode = (v: Finding): string => {
    if (opts.enforce) return 'enforce'
    if (opts.mode !== undefined) return opts.mode
    return (v.metadata?.mode as string | undefined) ?? 'advisory'
  }

  const hasEnforceViolation = opts.newViolations.some((v) => effectiveMode(v) === 'enforce')
  const hasHighFinding = opts.newFindings.some((f) => f.severity === 'high')
  if (hasEnforceViolation || hasHighFinding) return 'violation'

  const hasWarnViolation = opts.newViolations.some((v) => effectiveMode(v) === 'warn')
  if (hasWarnViolation || opts.newFindings.length > 0) return 'warn'

  return 'ok'
}

export const validateDiffCommand = defineCommand({
  meta: {
    name: 'validate-diff',
    description:
      'Validate working-tree diff against baseline. Reports new/removed rule ' +
      'violations and findings. Exit 1 if verdict is "violation" (pass --hook to never block).',
  },
  args: {
    root: { type: 'string', description: 'Project root override (default: cwd)' },
    workingFiles: {
      type: 'string',
      alias: 'working-files',
      description: 'Comma-separated list of changed files',
    },
    diff: { type: 'string', description: 'Path to a unified diff file to validate against' },
    against: { type: 'string', description: 'Git ref to diff against (default: HEAD)' },
    enforce: {
      type: 'boolean',
      default: false,
      description: 'Treat every rule violation as enforce-mode',
    },
    mode: { type: 'string', description: 'Global mode override: advisory | warn | enforce' },
    advisory: {
      type: 'boolean',
      default: false,
      description:
        'Force advisory mode (alias of --mode advisory). Caps the verdict at warn; never exits 1 from this command.',
    },
    json: { type: 'boolean', default: false },
    markdown: {
      type: 'boolean',
      default: false,
      description: 'Emit a GitHub-PR-comment-ready markdown block (for CI).',
    },
    hook: {
      type: 'boolean',
      default: false,
      description:
        'PostToolUse hook mode: implies --advisory, never exits non-zero, and ' +
        'no-ops when VIBEGRAPH_HOOK=0. For the Claude Code / Cursor edit-loop.',
    },
    quiet: { type: 'boolean', default: false },
  },
  async run({ args }) {
    // Hook escape hatch: VIBEGRAPH_HOOK=0 disables the PostToolUse hook entirely.
    if (args.hook && process.env.VIBEGRAPH_HOOK === '0') return

    const log = createCliLogger({ json: args.json, quiet: args.quiet })

    // Helper: emit a CLI-boundary error through the formatter (json/markdown) or
    // as a structured log line (plain), then set exit 1. This mirrors the
    // result.status==='error' branch below so early validation errors also
    // produce a PR-comment-ready block when --markdown is set.
    const emitError = (message: string, logPayload?: Record<string, unknown>): void => {
      if (args.json || args.markdown) {
        const formatted = formatValidateDiffResult(
          { status: 'error', error: message },
          { json: args.json, markdown: args.markdown },
        )
        process.stdout.write(`${formatted.text}\n`)
      } else {
        log.error(logPayload ?? {}, message)
      }
      process.exitCode = resolveExitCode({ hook: args.hook, failureExit: 1 })
    }

    // Validate --mode at the CLI boundary
    let mode: RunValidateDiffOptions['mode'] | undefined
    if (args.mode !== undefined) {
      if (args.mode !== 'advisory' && args.mode !== 'warn' && args.mode !== 'enforce') {
        emitError(`Invalid --mode: ${args.mode}. Expected one of: advisory | warn | enforce.`, {
          mode: args.mode,
        })
        return
      }
      mode = args.mode as RunValidateDiffOptions['mode']
    }

    // --advisory is a convenience alias for --mode advisory. Always floors the mode
    // at advisory regardless of --mode (so `--mode enforce --advisory` is still advisory).
    // This matches the hook design intent: post-tool-use feedback must never block.
    if (args.advisory) {
      mode = 'advisory'
    }

    // --hook without --enforce implies advisory: surface findings but never block.
    // --hook --enforce is an explicit override: respect the enforce request so
    // formatHookOutput can emit {decision:'block', reason} for PostToolUse hooks
    // that want to stop the agent on architectural regressions.
    // NOTE: in all hook cases process.exitCode stays 0 (set below) — a
    // PostToolUse decision:block is exit-0 corrective feedback, NOT a failure.
    if (args.hook && !args.enforce) {
      mode = 'advisory'
    }

    const projectRoot = await resolveProjectRoot({
      explicit: args.root,
      cwd: process.cwd(),
    })

    // The plugin hook fires on every Edit/Write in every repo on the machine, so
    // hook mode only acts in projects that opted in. Elsewhere: no nudge and no
    // activity log — appending one would create .vibegraph/ and opt the repo in.
    if (args.hook && !existsSync(join(projectRoot, '.vibegraph'))) return

    const workingFiles = args.workingFiles
      ? args.workingFiles
          .split(',')
          .map((s) => s.trim())
          .filter((s) => s.length > 0)
      : undefined

    // Read --diff file if provided
    let diffText: string | undefined
    if (args.diff !== undefined) {
      const { readFile } = await import('node:fs/promises')
      try {
        diffText = await readFile(args.diff, 'utf-8')
      } catch (err) {
        emitError(`Failed to read --diff file: ${args.diff}`, {
          diff: args.diff,
          error: (err as Error).message,
        })
        return
      }
    }

    const t0 = Date.now()
    const result = await runValidateDiff({
      projectRoot,
      workingFiles,
      diff: diffText,
      against: args.against,
      enforce: args.enforce,
      mode,
    })
    if (args.hook) {
      appendActivityEntry(
        projectRoot,
        buildHookActivityEntry(result, {
          now: t0,
          durationMs: Date.now() - t0,
          against: args.against,
          mode,
        }),
      )
    }

    if (result.status === 'error') {
      // Hook + NO_BASELINE: emit a friendly advisory nudge instead of a raw error.
      // The baseline is missing because `vibe-graph init` hasn't run yet (or ran
      // before this Task shipped). Advisory exit 0 so the agent edit-loop is never
      // blocked by a setup issue.
      if (args.hook && result.error.startsWith('NO_BASELINE')) {
        process.stdout.write(
          `${JSON.stringify({
            hookSpecificOutput: {
              hookEventName: 'PostToolUse',
              additionalContext:
                'vibe-graph: no baseline yet — run `vibe-graph baseline` to enable change checks.',
            },
          })}\n`,
        )
        process.exitCode = 0
        return
      }

      // In structured modes, emit the formatted error (markdown carries the
      // PR-comment marker) so consumers get machine/PR-ready output. Plain mode
      // keeps the human log line. Either way exit 1 — a real error must surface.
      if (args.json || args.markdown) {
        const formatted = formatValidateDiffResult(result, {
          json: args.json,
          markdown: args.markdown,
        })
        process.stdout.write(`${formatted.text}\n`)
      } else {
        log.error({ error: result.error }, 'validate-diff failed')
      }
      process.exitCode = resolveExitCode({ hook: args.hook, failureExit: 1 })
      return
    }

    if (args.hook) {
      // Hook mode: emit PostToolUse-shaped JSON, or nothing when clean.
      // Respect an explicit --enforce request: emit {decision:'block', reason} so
      // the agent loop is corrected. Without --enforce, emit advisory context only.
      // Exit code is ALWAYS 0 in hook mode — a PostToolUse decision:block is
      // exit-0 corrective feedback to the model, never a process failure.
      const hookMode = args.enforce ? 'enforce' : 'advisory'
      const hookOut = formatHookOutput(result, hookMode)
      if (hookOut) process.stdout.write(hookOut)
      process.exitCode = 0
      return
    }

    const formatted = formatValidateDiffResult(result, { json: args.json, markdown: args.markdown })
    if (args.json || args.markdown || !args.quiet) {
      process.stdout.write(`${formatted.text}\n`)
    }
    process.exitCode = resolveExitCode({ hook: args.hook, failureExit: formatted.exitCode })
  },
})
