import { existsSync } from 'node:fs'
import { readFile } from 'node:fs/promises'
import { resolve } from 'node:path'
import { basename, join } from 'node:path'
import { scan, writeSnapshotAtomic } from '@codearch/core'
import { runBaseline } from '../commands/baseline.js'
import { type DetectedIde, detectIde } from './detect-ide.js'
import { type DetectedStack, detectStack } from './detect-stack.js'
import { type GenerateCursorRulesResult, generateCursorRules } from './generators-cursor-rules.js'
import { type GenerateHookResult, generateClaudeCodeHook } from './generators-hooks.js'
import {
  type AppendGitignoreResult,
  type GenerateConfigYmlResult,
  type GenerateIgnoreFileResult,
  type GenerateMcpConfigResult,
  appendGitignore,
  generateConfigYml,
  generateIgnoreFile,
  generateMcpConfig,
} from './generators.js'

export interface InitPrompts {
  /** Confirm overwriting an existing `.vibegraph/` (returns false on user cancel). */
  confirmOverwrite(opts: { hasExistingConfig: boolean }): Promise<boolean>
  /** For each detected IDE, ask whether to write its MCP config. */
  confirmMcpConfig(opts: { ide: DetectedIde }): Promise<boolean>
  /** Display a step heading (informational). */
  log(message: string): void
  /** Display a warning. */
  warn(message: string): void
  /** Display a success step. */
  success(message: string): void
}

export interface RunInitOptions {
  projectRoot: string
  /** Auto-confirm all prompts (--yes). */
  yes: boolean
  /** Force overwrite of existing config (--force). */
  force: boolean
  /** Prompts adapter (injectable for tests). */
  prompts: InitPrompts
  /** Override home directory for IDE detection (for tests). */
  homeDir?: string
  /** When true, also merge a vibe-graph PostToolUse entry into .claude/settings.json (opt-in). */
  hooks?: boolean
  /**
   * Non-destructive: only merge the PostToolUse hook; skip config/ignore/mcp/cursor.
   * Overrides `hooks` — no need to also set `hooks: true`.
   */
  hooksOnly?: boolean
}

export interface InitResult {
  /** Project name derived from package.json or directory basename. */
  projectName: string
  stack: DetectedStack
  detectedIdes: DetectedIde[]
  /** Steps that ran. Each has a status — written/skipped/aborted. */
  steps: InitStep[]
  /** Overall outcome. */
  status: 'completed' | 'aborted'
  /** Set if status === 'aborted'. */
  abortReason?: string
}

export type InitStep =
  | { kind: 'config-yml'; result: GenerateConfigYmlResult }
  | { kind: 'ignore-file'; result: GenerateIgnoreFileResult }
  | { kind: 'gitignore'; result: AppendGitignoreResult }
  | { kind: 'mcp-config'; ide: DetectedIde; result: GenerateMcpConfigResult }
  | { kind: 'mcp-config'; ide: DetectedIde; skipped: 'user-declined' }
  | { kind: 'cursor-rules'; result: GenerateCursorRulesResult }
  | { kind: 'hooks'; result: GenerateHookResult }
  | { kind: 'baseline'; status: 'ok'; baselinePath: string }
  | { kind: 'baseline'; status: 'skipped'; reason: string }

/**
 * Run the full init flow. Pure orchestration — file I/O is in the generators.
 */
export async function runInit(opts: RunInitOptions): Promise<InitResult> {
  const projectName = await deriveProjectName(opts.projectRoot)
  const stack = await detectStack({ projectRoot: opts.projectRoot })
  const { ides: detectedIdes } = detectIde({ projectRoot: opts.projectRoot, homeDir: opts.homeDir })

  opts.prompts.log(
    `Detected: language=${stack.language}, packageManager=${stack.packageManager}, monorepo=${stack.monorepo}`,
  )
  if (stack.frameworks.length > 0) {
    opts.prompts.log(`Frameworks: ${stack.frameworks.join(', ')}`)
  }
  if (detectedIdes.length > 0) {
    opts.prompts.log(`IDEs detected: ${detectedIdes.join(', ')}`)
  }

  // --hooks-only: non-destructive. Add (merge) only the PostToolUse hook; do not
  // touch config/ignore/mcp/cursor and never prompt for overwrite. Safe to run on
  // an already-initialized repo.
  if (opts.hooksOnly) {
    // force is opts.force only — non-destructive mode deliberately does NOT widen
    // to `overwrite` (i.e. --yes alone is not treated as force here).
    const hookResult = await generateClaudeCodeHook({
      projectRoot: opts.projectRoot,
      force: opts.force,
      packageManager: stack.packageManager,
    })
    if (hookResult.status !== 'error') warnHookResolvability(opts, stack)
    return {
      projectName,
      stack,
      detectedIdes,
      steps: [{ kind: 'hooks', result: hookResult }],
      status: 'completed',
    }
  }

  const hasExistingConfig = existsSync(join(opts.projectRoot, '.vibegraph'))

  // Confirm overwrite if existing config and not --force and not --yes
  if (hasExistingConfig && !opts.force && !opts.yes) {
    const confirmed = await opts.prompts.confirmOverwrite({ hasExistingConfig: true })
    if (!confirmed) {
      return {
        projectName,
        stack,
        detectedIdes,
        steps: [],
        status: 'aborted',
        abortReason: '.vibegraph/ exists; user declined overwrite. Pass --force to bypass.',
      }
    }
  }

  const overwrite = opts.force || (hasExistingConfig && opts.yes)
  const steps: InitStep[] = []

  // 1. config.yml
  const configResult = await generateConfigYml({
    projectRoot: opts.projectRoot,
    projectName,
    overwrite,
  })
  steps.push({ kind: 'config-yml', result: configResult })
  if (configResult.written) {
    opts.prompts.success(`Wrote ${configResult.path}`)
  } else {
    opts.prompts.warn('Skipped config.yml (already exists; use --force to overwrite)')
  }

  // 2. .vibegraphignore
  const ignoreResult = await generateIgnoreFile({
    projectRoot: opts.projectRoot,
    overwrite,
  })
  steps.push({ kind: 'ignore-file', result: ignoreResult })
  if (ignoreResult.written) {
    opts.prompts.success(`Wrote ${ignoreResult.path}`)
  } else {
    opts.prompts.warn('Skipped .vibegraphignore (already exists)')
  }

  // 3. .gitignore (always idempotent — no overwrite concept)
  const gitignoreResult = await appendGitignore({ projectRoot: opts.projectRoot })
  steps.push({ kind: 'gitignore', result: gitignoreResult })
  if (gitignoreResult.appended.length > 0) {
    opts.prompts.success(
      `Updated .gitignore (${gitignoreResult.appended.length} ${gitignoreResult.created ? 'created' : 'added'})`,
    )
  } else {
    opts.prompts.log('.gitignore already covers Vibe Graph paths')
  }

  // 4. MCP configs — per detected IDE
  for (const ide of detectedIdes) {
    let shouldWrite = true
    if (!opts.yes) {
      shouldWrite = await opts.prompts.confirmMcpConfig({ ide })
    }
    if (!shouldWrite) {
      steps.push({ kind: 'mcp-config', ide, skipped: 'user-declined' })
      opts.prompts.log(`Skipped MCP config for ${ide} (user declined)`)
      continue
    }
    const mcpResult = await generateMcpConfig({
      projectRoot: opts.projectRoot,
      target: ide,
      overwrite,
    })
    steps.push({ kind: 'mcp-config', ide, result: mcpResult })
    if (mcpResult.written) {
      opts.prompts.success(
        `Wrote ${mcpResult.path}${mcpResult.merged ? ' (merged with existing)' : ''}`,
      )
    } else if (mcpResult.skipped === 'already-configured') {
      opts.prompts.log(`MCP for ${ide} already configured`)
    } else {
      opts.prompts.warn(`Skipped MCP config for ${ide} (${mcpResult.skipped ?? 'unknown reason'})`)
    }
  }

  // 5. Cursor rules (.cursor/rules/vibe-graph.mdc)
  if (detectedIdes.includes('cursor')) {
    const cursorRulesResult = await generateCursorRules({
      projectRoot: opts.projectRoot,
      overwrite,
    })
    steps.push({ kind: 'cursor-rules', result: cursorRulesResult })
    if (cursorRulesResult.written) {
      opts.prompts.success(`Wrote ${cursorRulesResult.path}`)
    } else if (cursorRulesResult.skipped) {
      opts.prompts.log(`Skipped ${cursorRulesResult.path} (${cursorRulesResult.skipped})`)
    }
  }

  // Optional: Claude Code PostToolUse hook (opt-in via --hooks)
  if (opts.hooks) {
    const hookResult = await generateClaudeCodeHook({
      projectRoot: opts.projectRoot,
      force: overwrite,
      packageManager: stack.packageManager,
    })
    steps.push({ kind: 'hooks', result: hookResult })
    switch (hookResult.status) {
      case 'created':
        opts.prompts.log(`✓ wrote ${hookResult.path}`)
        break
      case 'merged':
        opts.prompts.log(`✓ merged into ${hookResult.path}`)
        break
      case 'replaced':
        opts.prompts.log(`✓ replaced our entry in ${hookResult.path}`)
        break
      case 'exists':
        opts.prompts.log(`◦ ${hookResult.path} already has our hook (use --force to refresh)`)
        break
      case 'error':
        opts.prompts.log(`✗ hook generation failed: ${hookResult.error}`)
        break
    }
    if (hookResult.status !== 'error') warnHookResolvability(opts, stack)
  }

  // 6. Initial scan + baseline — enables `validate-diff` out of the box.
  // Guarded: if scan fails, log and continue (init success must not depend on scan).
  try {
    const snapshot = await scan({ root: opts.projectRoot })
    const graphPath = resolve(opts.projectRoot, '.vibegraph/cache/graph.json')
    await writeSnapshotAtomic(graphPath, snapshot)
    const baselineResult = await runBaseline({ projectRoot: opts.projectRoot })
    if (baselineResult.status === 'ok') {
      steps.push({ kind: 'baseline', status: 'ok', baselinePath: baselineResult.baselinePath })
      opts.prompts.success('Wrote initial graph baseline (.vibegraph/cache/baseline.json)')
    } else {
      steps.push({ kind: 'baseline', status: 'skipped', reason: baselineResult.error })
      opts.prompts.warn(`Skipped initial baseline: ${baselineResult.error}`)
    }
  } catch (err) {
    const reason = (err as Error).message
    steps.push({ kind: 'baseline', status: 'skipped', reason })
    opts.prompts.warn(`Skipped initial baseline (scan failed): ${reason}`)
  }

  return {
    projectName,
    stack,
    detectedIdes,
    steps,
    status: 'completed',
  }
}

async function deriveProjectName(projectRoot: string): Promise<string> {
  const pkgPath = join(projectRoot, 'package.json')
  if (existsSync(pkgPath)) {
    try {
      const raw = await readFile(pkgPath, 'utf-8')
      const parsed = JSON.parse(raw) as { name?: string }
      if (typeof parsed.name === 'string' && parsed.name.length > 0) {
        // Strip @scope/ prefix for the config — keep the bare name
        const parts = parsed.name.split('/')
        return parsed.name.includes('/') ? (parts[parts.length - 1] ?? parsed.name) : parsed.name
      }
    } catch {
      // fall through
    }
  }
  return basename(projectRoot)
}

/** True if `vibe-graph` resolves as a local bin, so the emitted `<pm> exec` hook
 * command will actually run. */
function hookBinResolvable(projectRoot: string): boolean {
  return existsSync(join(projectRoot, 'node_modules', '.bin', 'vibe-graph'))
}

/** Warn when the generated hook command won't resolve because `vibe-graph` isn't
 * installed in the project — otherwise the PostToolUse hook silently does nothing. */
function warnHookResolvability(opts: RunInitOptions, stack: DetectedStack): void {
  if (hookBinResolvable(opts.projectRoot)) return
  const pm = stack.packageManager === 'unknown' ? 'npm' : stack.packageManager
  opts.prompts.warn(
    `Hook installed, but \`@codearch/cli\` isn't installed in this project — the hook command won't resolve until you add it (e.g. \`${pm} add -D @codearch/cli\`).`,
  )
}

// ─── Adapters ────────────────────────────────────────────────────────────────

/** Auto-confirm adapter used when --yes is passed. */
export const yesPrompts: InitPrompts = {
  confirmOverwrite: async () => true,
  confirmMcpConfig: async () => true,
  log: () => {},
  warn: () => {},
  success: () => {},
}
