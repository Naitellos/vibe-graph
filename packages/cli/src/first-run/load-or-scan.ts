import { existsSync } from 'node:fs'
import { readFile } from 'node:fs/promises'
import { join } from 'node:path'
import { type LoadedSnapshot, SnapshotSchema, buildLoadedSnapshot } from '@codearch/core'
import type { Logger } from 'pino'
import { runOneShotScan } from '../commands/scan.js'

/** Produce a LoadedSnapshot for the Overview: use the cached graph if present,
 * else scan (which writes the cache), then load + build. */
export async function loadOrScanOverviewSnapshot(opts: {
  projectRoot: string
  rescan: boolean
  log: Logger
}): Promise<LoadedSnapshot> {
  const graphPath = join(opts.projectRoot, '.vibegraph', 'cache', 'graph.json')
  if (opts.rescan || !existsSync(graphPath)) {
    await runOneShotScan({ root: opts.projectRoot, log: opts.log })
  }
  const snapshot = SnapshotSchema.parse(JSON.parse(await readFile(graphPath, 'utf-8')))
  return buildLoadedSnapshot(snapshot)
}
