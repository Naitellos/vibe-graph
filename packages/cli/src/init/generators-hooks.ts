import { existsSync } from 'node:fs'
import { mkdir, readFile, writeFile } from 'node:fs/promises'
import { dirname, join } from 'node:path'
import type { PackageManager } from './detect-stack.js'

const OUR_MATCHER = 'Edit|Write'

/**
 * The PostToolUse hook command, resolvable for the project's package manager
 * (local install — not a global `@codearch/cli` on PATH). Uses `--hook` mode so it
 * never blocks the agent and degrades gracefully before baseline setup.
 *
 * The local bin is named `vibe-graph` (the "bin" field in package.json) regardless
 * of the scoped package name, so `pnpm exec vibe-graph` and `yarn exec vibe-graph`
 * resolve correctly for local installs. For `npx` (npm fallback) we use the
 * scoped package name (@codearch/cli) since npx resolves by package, not bin.
 */
export function hookCommand(packageManager: PackageManager): string {
  const args = 'validate-diff --json --hook'
  switch (packageManager) {
    case 'pnpm':
      return `pnpm exec vibe-graph ${args}`
    case 'yarn':
      return `yarn exec vibe-graph ${args}`
    // npm and unknown both use npx (ships with npm, available everywhere).
    default:
      return `npx -y @codearch/cli ${args}`
  }
}

export interface GenerateHookOptions {
  projectRoot: string
  /** Overwrite our existing entry if already present (default false). */
  force?: boolean
  /** Package manager used to build a resolvable command (default 'unknown' → npx). */
  packageManager?: PackageManager
}

export type GenerateHookResult =
  | { status: 'created'; path: string }
  | { status: 'merged'; path: string }
  | { status: 'exists'; path: string }
  | { status: 'replaced'; path: string }
  | { status: 'error'; error: string }

interface HookCommandEntry {
  type: 'command'
  command: string
  timeout?: number
}

interface PostToolUseEntry {
  matcher: string
  hooks: HookCommandEntry[]
}

interface ClaudeSettings {
  hooks?: {
    PostToolUse?: PostToolUseEntry[]
    [key: string]: unknown
  }
  [key: string]: unknown
}

/**
 * Generate (or merge into) a Claude Code PostToolUse hook in
 * `.claude/settings.json`. The hook runs `validate-diff … --json --hook` after
 * each Edit or Write tool use. The exact invocation is package-manager-specific
 * (see `hookCommand`); `--hook` mode never blocks the agent's edit loop and
 * degrades gracefully before baseline setup.
 *
 * Schema follows the canonical Claude Code format (see
 * https://code.claude.com/docs/en/hooks-guide.md):
 * - File path: `.claude/settings.json` (NOT `.claude/hooks/*.json`)
 * - Shape: `{ hooks: { PostToolUse: [{ matcher, hooks: [{ type:'command', command, timeout }] }] } }`
 * - Timeout is in SECONDS (not milliseconds)
 *
 * Merge semantics:
 * - Preserves other top-level settings (model, permissions, etc.)
 * - Preserves other PostToolUse entries (only touches our own)
 * - Idempotent: if our exact command is already wired, returns 'exists'
 *   (no change), unless `force: true` (replaces our entry, leaves others alone)
 * - Malformed existing settings.json returns 'error' (refuses to overwrite)
 */
export async function generateClaudeCodeHook(
  opts: GenerateHookOptions,
): Promise<GenerateHookResult> {
  const settingsPath = join(opts.projectRoot, '.claude', 'settings.json')
  const existed = existsSync(settingsPath)
  const command = hookCommand(opts.packageManager ?? 'unknown')

  let settings: ClaudeSettings = {}
  if (existed) {
    try {
      settings = JSON.parse(await readFile(settingsPath, 'utf-8')) as ClaudeSettings
    } catch (err) {
      return {
        status: 'error',
        error: `Failed to parse existing ${settingsPath}: ${(err as Error).message}`,
      }
    }
  }

  if (settings.hooks === undefined) settings.hooks = {}
  if (settings.hooks.PostToolUse === undefined) settings.hooks.PostToolUse = []
  const postToolUse = settings.hooks.PostToolUse

  // Idempotency check: is our exact command already wired anywhere in PostToolUse?
  // Matching is by exact command string — if the emitted command changes (a flag
  // or package-manager prefix), a previously-wired entry won't match and a re-run
  // appends a new entry instead of replacing the stale one.
  const indexOfExisting = postToolUse.findIndex((entry) =>
    entry.hooks?.some((h) => h.command === command),
  )
  const alreadyPresent = indexOfExisting >= 0

  if (alreadyPresent && !opts.force) {
    return { status: 'exists', path: settingsPath }
  }

  const ourEntry: PostToolUseEntry = {
    matcher: OUR_MATCHER,
    hooks: [{ type: 'command', command, timeout: 30 }],
  }

  if (alreadyPresent && opts.force) {
    postToolUse[indexOfExisting] = ourEntry
  } else {
    postToolUse.push(ourEntry)
  }

  await mkdir(dirname(settingsPath), { recursive: true })
  await writeFile(settingsPath, `${JSON.stringify(settings, null, 2)}\n`, 'utf-8')

  if (!existed) return { status: 'created', path: settingsPath }
  if (alreadyPresent) return { status: 'replaced', path: settingsPath }
  return { status: 'merged', path: settingsPath }
}
