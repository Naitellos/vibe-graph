export const SUBCOMMAND_NAMES = new Set([
  'init',
  'scan',
  'baseline',
  'check',
  'mcp',
  'doctor',
  'context',
  'impact',
  'stats',
  'validate-diff',
  'default',
  'cockpit',
])
const VALUE_FLAGS = new Set(['--root', '--port'])

export interface BareArgs {
  root?: string
  port?: number
  /** true when --port was given but isn't a valid 1..65535 integer. */
  portError: boolean
  noOpen: boolean
  rescan: boolean
  cockpit: boolean
  json: boolean
  quiet: boolean
}

/** Find the first real positional token, correctly skipping the values of
 * space-form value flags (so `--root /tmp` doesn't see `/tmp` as positional). */
function firstPositional(argv: string[]): string | undefined {
  for (let i = 0; i < argv.length; i++) {
    const a = argv[i] as string
    if (VALUE_FLAGS.has(a)) {
      i++ // skip the value token
      continue
    }
    if (a.startsWith('-')) continue
    return a
  }
  return undefined
}

/** Bare overview unless help/version or a real subcommand is present. citty
 * mishandles space-form root value-flags when subCommands exist, so the bare
 * flow parses argv itself (see parseBareArgs) — this decides routing. */
export function shouldRunBareOverview(argv: string[]): boolean {
  if (argv.some((a) => a === '--help' || a === '-h' || a === '--version' || a === '-v')) {
    return false
  }
  const pos = firstPositional(argv)
  return pos === undefined || !SUBCOMMAND_NAMES.has(pos)
}

export function parseBareArgs(argv: string[]): BareArgs {
  const out: BareArgs = {
    portError: false,
    noOpen: false,
    rescan: false,
    cockpit: false,
    json: false,
    quiet: false,
  }
  for (let i = 0; i < argv.length; i++) {
    const a = argv[i] as string
    const eq = a.indexOf('=')
    const key = eq >= 0 ? a.slice(0, eq) : a
    const inlineVal = eq >= 0 ? a.slice(eq + 1) : undefined
    const takeVal = (): string | undefined => {
      if (inlineVal !== undefined) return inlineVal
      const next = argv[i + 1]
      if (next !== undefined && !next.startsWith('-')) {
        i++
        return next
      }
      return undefined
    }
    switch (key) {
      case '--root':
        out.root = takeVal()
        break
      case '--port': {
        const v = takeVal()
        const n = Number(v)
        if (v === undefined || !Number.isInteger(n) || n <= 0 || n > 65535) out.portError = true
        else out.port = n
        break
      }
      case '--no-open':
        out.noOpen = true
        break
      case '--rescan':
        out.rescan = true
        break
      case '--cockpit':
        out.cockpit = true
        break
      case '--json':
        out.json = true
        break
      case '--quiet':
        out.quiet = true
        break
    }
  }
  return out
}

export interface MisplacedRootFlag {
  /** The offending token, exactly as the user typed it. */
  flag: string
  /**
   * For the space form (`--root /tmp/x`), the value token. Undefined for the
   * self-contained `--root=/tmp/x`. Callers MUST include it when echoing a
   * corrected command: `vibe-graph scan --root` with no path is itself silently
   * ignored, so a suggestion that drops the value reproduces the very bug this
   * guard exists to prevent.
   */
  value?: string
  /** The subcommand it was meant for. */
  subcommand: string
}

/**
 * Detect a `--root` passed BEFORE a subcommand, where citty silently drops it.
 *
 * citty does not forward parent args to subcommands, so `vibe-graph --root=X scan`
 * loses the flag entirely and the command falls back to resolving the project root
 * by walking UP from cwd. That cascade can land on a completely different project,
 * and the CLI then reports a confident, well-formed answer about the wrong repo
 * rather than failing — the worst outcome for an evidence-based tool. It is what
 * made examples/conformance-demo scan the parent monorepo and print `Status: OK`
 * where its own README promises `WARN`.
 *
 * Returns the offending flag + the subcommand so the caller can hard-error with an
 * actionable message. Bare invocations (no subcommand) parse `--root` themselves in
 * parseBareArgs and are correctly left alone.
 */
export function findMisplacedRootFlag(argv: string[]): MisplacedRootFlag | undefined {
  let flag: string | undefined
  let value: string | undefined
  for (let i = 0; i < argv.length; i++) {
    const a = argv[i] as string
    if (VALUE_FLAGS.has(a)) {
      if (a === '--root' && flag === undefined) {
        flag = a
        value = argv[i + 1]
      }
      i++ // skip the value token — it is never a subcommand
      continue
    }
    if (a.startsWith('--root=')) {
      if (flag === undefined) flag = a
      continue
    }
    if (a.startsWith('-')) continue
    // First real positional. Only a subcommand can strand a preceding --root.
    if (SUBCOMMAND_NAMES.has(a) && flag !== undefined) {
      return value === undefined ? { flag, subcommand: a } : { flag, value, subcommand: a }
    }
    return undefined
  }
  return undefined
}
