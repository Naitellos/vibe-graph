export interface BinConfig {
  /** Absolute or relative project root path. */
  projectRoot: string
  /** Snapshot path: <projectRoot>/.vibegraph/cache/graph.json */
  snapshotPath: string
  /** Whether to auto-scan when graph.json is missing/stale. Default true. */
  autoScanOnMissing: boolean
}

export interface ParseBinArgsInput {
  argv: readonly string[] // process.argv.slice(2)
  env: Record<string, string | undefined>
  cwd: string
}

/**
 * Parse CLI args + env into a BinConfig.
 * - --project-root <path> (defaults to cwd)
 * - VIBEGRAPH_MCP_AUTO_SCAN env: 'false'/'0'/'no' disables auto-scan; anything else (including unset) enables.
 */
export function parseBinArgs(input: ParseBinArgsInput): BinConfig {
  let projectRoot = input.cwd
  for (let i = 0; i < input.argv.length; i++) {
    const arg = input.argv[i]
    if (arg === '--project-root' && i + 1 < input.argv.length) {
      const v = input.argv[i + 1]
      if (typeof v === 'string') projectRoot = v
      i++
    } else if (arg?.startsWith('--project-root=')) {
      projectRoot = arg.slice('--project-root='.length)
    }
  }

  // Resolve snapshot path relative to projectRoot
  // (Don't resolve to absolute here — let SnapshotReader handle that.)
  const snapshotPath = `${projectRoot}/.vibegraph/cache/graph.json`.replace(/\/+/g, '/')

  const autoScanRaw = input.env.VIBEGRAPH_MCP_AUTO_SCAN
  const autoScanOnMissing =
    autoScanRaw === undefined ? true : !['false', '0', 'no', 'FALSE'].includes(autoScanRaw)

  return { projectRoot, snapshotPath, autoScanOnMissing }
}
