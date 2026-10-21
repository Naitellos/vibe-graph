import { resolve } from 'node:path'
import { scan, writeSnapshotAtomic } from '@codearch/core'
import { defineCommand } from 'citty'
import { createCliLogger } from '../logger.js'

export const scanCommand = defineCommand({
  meta: {
    name: 'scan',
    description: 'Re-index the project and write .vibegraph/cache/graph.json',
  },
  args: {
    root: {
      type: 'string',
      description: 'Project root override (default: cwd)',
    },
    json: { type: 'boolean', default: false },
    quiet: { type: 'boolean', default: false },
    watch: { type: 'boolean', description: 'Re-scan on file changes (Task 4.4)', default: false },
  },
  async run({ args }) {
    const log = createCliLogger({ json: args.json, quiet: args.quiet })

    if (args.watch) {
      const { runWatchScan } = await import('./scan-watch.js')
      const root = typeof args.root === 'string' ? args.root : process.cwd()
      const controller = await runWatchScan({ root, log })
      // Graceful shutdown on SIGINT / SIGTERM
      process.on('SIGINT', () => {
        void controller.stop().then(() => process.exit(0))
      })
      process.on('SIGTERM', () => {
        void controller.stop().then(() => process.exit(0))
      })
      // Keep the process alive — chokidar's persistent: true already does this,
      // but await a never-resolving promise for clarity.
      await new Promise<void>(() => {})
      return
    }

    await runOneShotScan({
      root: typeof args.root === 'string' ? args.root : undefined,
      log,
    })
  },
})

export interface RunScanOptions {
  /** Explicit project root. If undefined, scan() resolves via cascade from cwd. */
  root?: string
  /** Logger from createCliLogger. */
  log: ReturnType<typeof createCliLogger>
}

export interface ScanSummary {
  scanId: string
  durationMs: number
  counts: {
    nodes: number
    edges: number
    findings: number
    evidence: number
  }
  graphPath: string
}

/**
 * Exported for direct unit testing without going through citty.
 * Runs a single scan, writes graph.json atomically, logs a summary.
 */
export async function runOneShotScan(opts: RunScanOptions): Promise<ScanSummary> {
  const startedAt = Date.now()
  opts.log.info('scan: starting')

  // Forward the CLI logger into scan() so analyzer warnings (e.g. the
  // config.yml/subsystem-docs shadow warning) reach the user. Without this,
  // scan() falls back to a silent logger and those warnings vanish.
  const snapshot = await scan({
    log: opts.log,
    ...(opts.root !== undefined ? { root: opts.root } : {}),
  })
  const projectRoot = snapshot.meta.projectRoot
  const graphPath = resolve(projectRoot, '.vibegraph/cache/graph.json')

  await writeSnapshotAtomic(graphPath, snapshot)

  const summary: ScanSummary = {
    scanId: snapshot.meta.scanId,
    durationMs: Date.now() - startedAt,
    counts: {
      nodes: snapshot.nodes.length,
      edges: snapshot.edges.length,
      findings: snapshot.findings.length,
      evidence: snapshot.evidence.length,
    },
    graphPath,
  }

  opts.log.info(
    {
      scanId: summary.scanId,
      durationMs: summary.durationMs,
      counts: summary.counts,
      graphPath: summary.graphPath,
    },
    `scan: complete in ${summary.durationMs}ms (${summary.counts.nodes} nodes, ${summary.counts.edges} edges, ${summary.counts.findings} findings)`,
  )

  return summary
}
