import { existsSync } from 'node:fs'
import { readFile } from 'node:fs/promises'
import { join } from 'node:path'
import {
  type Finding,
  type InertRuleWarning,
  type Snapshot,
  SnapshotSchema,
  buildLoadedSnapshot,
  collectInertRuleWarnings,
  evaluateRules,
  loadConfig,
  loadGraphBaseline,
  resolveProjectRoot,
} from '@codearch/core'
import { defineCommand } from 'citty'
import { createCliLogger } from '../logger.js'
import { formatCheckResult } from './check-format.js'

export interface RunCheckOptions {
  projectRoot: string
  /** Treat every finding as effective mode 'enforce' (alias: --mode enforce). */
  enforce?: boolean
  /** Filter out findings whose id is present in baseline.findings. */
  sinceBaseline?: boolean
  /** Restrict to findings whose metadata.ruleId equals this string. */
  rule?: string
  /** Global mode override; takes precedence over metadata.mode. */
  mode?: 'advisory' | 'warn' | 'enforce'
  /**
   * Fail the check (exit 1) when any rule references a subsystem id absent from
   * the graph — either an inert rule (positive matcher can never fire) or a dead
   * exclusion/allowance (rule fires more broadly / is stricter than intended).
   * Off by default: both are config problems, not architecture violations, so
   * they only warn. Turn this on in CI to catch rules that silently misbehave.
   */
  strictRules?: boolean
}

export type RunCheckResult =
  | {
      status: 'ok'
      ruleFindings: Finding[]
      /**
       * Rules referencing subsystem ids absent from the graph — truly inert
       * matchers (`kind: 'inert'`, can never fire) or dead exclusions/allowances
       * (`kind: 'dead-reference'`, rule misbehaves in the opposite direction).
       * Either way an empty `ruleFindings` alongside a non-empty `inertRules`
       * is NOT a trustworthy pass — the formatter surfaces it so the
       * "No rule violations" verdict is not a silent false green. Optional so
       * existing callers/tests constructing a result stay valid; `runCheck`
       * always populates it (possibly empty).
       */
      inertRules?: InertRuleWarning[]
      /** True when an enforce-mode rule finding fired — the classic blocking cause. */
      enforceViolation?: boolean
      /**
       * True when `--strict-rules` escalated one or more inert rules into a build
       * failure. Independent of `enforceViolation`: either (or both) can drive
       * `exitCode: 1`, and the formatter names the actual cause.
       */
      strictInertFailure?: boolean
      exitCode: 0 | 1
    }
  | { status: 'error'; error: string }

/**
 * Pure runner — exported for tests. The CLI command wraps this.
 *
 * Reads .vibegraph/cache/graph.json, then RE-EVALUATES rules against the
 * CURRENT config + baseline. We deliberately do not trust pre-computed rule
 * findings in the snapshot — if the user edited .vibegraph/config.yml after
 * the last scan, the snapshot's rule findings reflect the old rule set and
 * check would return a stale verdict. Recomputing makes the command's
 * promise — "report whether the current graph violates the current rules" —
 * literal and current.
 *
 * Exit code: any rule finding with effective mode 'enforce' → 1, else 0.
 */
export async function runCheck(opts: RunCheckOptions): Promise<RunCheckResult> {
  const graphPath = join(opts.projectRoot, '.vibegraph', 'cache', 'graph.json')
  if (!existsSync(graphPath)) {
    return {
      status: 'error',
      error: `No graph.json at ${graphPath}. Run \`vibe-graph scan\` first.`,
    }
  }

  let snapshot: Snapshot
  try {
    snapshot = SnapshotSchema.parse(JSON.parse(await readFile(graphPath, 'utf-8')))
  } catch (err) {
    return {
      status: 'error',
      error: `Failed to parse graph.json: ${(err as Error).message}`,
    }
  }

  // Re-evaluate rules against CURRENT config + baseline (don't trust stale
  // snapshot.findings). Same delta-aware semantics as Stage 4.6 in scan.
  const { config } = await loadConfig(opts.projectRoot)
  const baseline = await loadGraphBaseline(opts.projectRoot)
  const loaded = buildLoadedSnapshot(snapshot)
  let filtered = evaluateRules({ snapshot: loaded, baseline, rules: config.rules })

  // Detect rules that reference subsystem ids absent from the graph. Such rules
  // match nothing and pass silently — surfacing them keeps "No rule violations"
  // from being a false green. Not baseline-filtered (a config problem, not a
  // graph finding).
  let inertRules = collectInertRuleWarnings(config.rules, loaded)

  // --since-baseline: drop findings whose id is in baseline
  if (opts.sinceBaseline && baseline) {
    const baselineIds = new Set(baseline.findings.map((f) => f.id))
    filtered = filtered.filter((f) => !baselineIds.has(f.id))
  }

  // --rule: restrict to one ruleId (findings AND inert-rule warnings)
  if (opts.rule !== undefined) {
    const wantedRuleId = opts.rule
    filtered = filtered.filter((f) => (f.metadata?.ruleId as string | undefined) === wantedRuleId)
    inertRules = inertRules.filter((w) => w.ruleId === wantedRuleId)
  }

  // Effective mode: --enforce > --mode > metadata.mode
  const hasEnforceViolation = filtered.some((f) => {
    if (opts.enforce) return true
    if (opts.mode !== undefined) return opts.mode === 'enforce'
    return (f.metadata?.mode as string | undefined) === 'enforce'
  })

  // --strict-rules: an inert rule (references a subsystem absent from the graph)
  // becomes a build failure instead of a mere warning.
  const strictInertFailure = (opts.strictRules ?? false) && inertRules.length > 0

  const exitCode: 0 | 1 = hasEnforceViolation || strictInertFailure ? 1 : 0

  return {
    status: 'ok',
    ruleFindings: filtered,
    inertRules,
    enforceViolation: hasEnforceViolation,
    strictInertFailure,
    exitCode,
  }
}

export const checkCommand = defineCommand({
  meta: {
    name: 'check',
    description:
      'Run the rules engine against the current snapshot. Exits 1 if any ' +
      'enforce-mode rule fires (or, with --strict-rules, if any rule references an unknown subsystem). ' +
      'Run after `vibe-graph scan`.',
  },
  args: {
    root: { type: 'string', description: 'Project root override (default: cwd)' },
    enforce: {
      type: 'boolean',
      default: false,
      description: 'Treat every rule finding as enforce-mode',
    },
    strictRules: {
      type: 'boolean',
      default: false,
      // citty (mri) does not kebab-map keys, so expose the conventional
      // kebab form as an alias alongside the camelCase flag.
      alias: 'strict-rules',
      description:
        'Exit 1 if any rule references a subsystem absent from the graph (inert rule or dead exclusion/allowance)',
    },
    sinceBaseline: {
      type: 'boolean',
      default: false,
      alias: 'since-baseline',
      description: 'Only show findings introduced since baseline',
    },
    rule: { type: 'string', description: 'Filter to a single rule id' },
    mode: { type: 'string', description: 'Global mode override: advisory | warn | enforce' },
    json: { type: 'boolean', default: false },
    markdown: {
      type: 'boolean',
      default: false,
      description: 'Emit a GitHub-PR-comment-ready markdown block (for CI).',
    },
    quiet: { type: 'boolean', default: false },
  },
  async run({ args }) {
    const log = createCliLogger({ json: args.json, quiet: args.quiet })

    // Helper: emit a CLI-boundary error through the formatter (json/markdown) or
    // as a structured log line (plain), then set exit 1. This mirrors the
    // result.status==='error' branch below so early validation errors also
    // produce a PR-comment-ready block when --markdown is set.
    const emitError = (message: string): void => {
      if (args.json || args.markdown) {
        const formatted = formatCheckResult(
          { status: 'error', error: message },
          { json: args.json, markdown: args.markdown },
        )
        process.stdout.write(`${formatted.text}\n`)
      } else {
        log.error({ mode: args.mode }, message)
      }
      process.exitCode = 1
    }

    // Validate --mode at the CLI boundary
    let mode: RunCheckOptions['mode'] | undefined
    if (args.mode !== undefined) {
      if (args.mode !== 'advisory' && args.mode !== 'warn' && args.mode !== 'enforce') {
        emitError(`Invalid --mode: ${args.mode}. Expected one of: advisory | warn | enforce.`)
        return
      }
      mode = args.mode
    }

    const projectRoot = await resolveProjectRoot({
      explicit: args.root,
      cwd: process.cwd(),
    })

    const result = await runCheck({
      projectRoot,
      enforce: args.enforce,
      strictRules: args.strictRules,
      sinceBaseline: args.sinceBaseline,
      rule: args.rule,
      mode,
    })

    if (result.status === 'error') {
      // In structured modes, emit the formatted error (markdown carries the
      // PR-comment marker) so consumers get machine/PR-ready output. Plain mode
      // keeps the human log line. Either way exit 1 — a real error must surface.
      if (args.json || args.markdown) {
        const formatted = formatCheckResult(result, { json: args.json, markdown: args.markdown })
        process.stdout.write(`${formatted.text}\n`)
      } else {
        log.error({ error: result.error }, 'check failed')
      }
      process.exitCode = 1
      return
    }

    const formatted = formatCheckResult(result, { json: args.json, markdown: args.markdown })
    if (args.json || args.markdown || !args.quiet) {
      process.stdout.write(`${formatted.text}\n`)
    }
    process.exitCode = formatted.exitCode
  },
})
