import { resolve } from 'node:path'
import { createIgnoreMatcher } from '@codearch/core'
import chokidar, { type FSWatcher } from 'chokidar'
import type { Logger } from 'pino'
import { type ScanSummary, runOneShotScan } from './scan.js'

export interface RunWatchScanOptions {
  root: string
  log: Logger
  /** Debounce duration in ms. Default 300. */
  debounceMs?: number
  /**
   * Test seam — override the file-watcher factory.
   * Allows tests to inject a stub watcher that emits 'all' synthetically.
   */
  watcherFactory?: () => FSWatcher
}

export interface RunWatchScanController {
  /** Stop the watcher and any pending debounced scans. */
  stop(): Promise<void>
  /** Test seam: trigger a debounced scan as if a file changed. */
  triggerChange(path: string): void
}

/**
 * Start a watcher loop. Runs an initial scan, then re-scans on file changes
 * (debounced by `debounceMs`). The controller is returned for tests + signal handling.
 */
export async function runWatchScan(opts: RunWatchScanOptions): Promise<RunWatchScanController> {
  const debounceMs = opts.debounceMs ?? 300
  const root = resolve(opts.root)

  // Initial scan
  opts.log.info({ event: 'watch:start', root }, `watch: starting on ${root}`)
  let inFlight: Promise<ScanSummary> | null = runOneShotScan({ root, log: opts.log })
  await inFlight
  inFlight = null

  // Build the file watcher (skip ignored paths via IgnoreMatcher's defaults)
  const ignoreMatcher = createIgnoreMatcher({ patterns: [], includeDefaults: true })
  const watcher =
    opts.watcherFactory?.() ??
    chokidar.watch(root, {
      ignored: (path: string, stats?: { isFile?: () => boolean; isDirectory?: () => boolean }) => {
        const rel = path.startsWith(root) ? path.slice(root.length + 1) : path
        if (rel === '') return false
        // Always ignore our own cache writes
        if (rel.startsWith('.vibegraph/')) return true
        return ignoreMatcher.ignores(rel)
      },
      ignoreInitial: true,
      persistent: true,
      awaitWriteFinish: { stabilityThreshold: 50, pollInterval: 25 },
    })

  let debounceTimer: NodeJS.Timeout | null = null
  let pendingChanges = 0

  const scheduleRescan = (changedPath: string): void => {
    pendingChanges++
    if (debounceTimer !== null) clearTimeout(debounceTimer)
    debounceTimer = setTimeout(() => {
      void runRescan(changedPath)
    }, debounceMs)
  }

  async function runRescan(triggerPath: string): Promise<void> {
    const collected = pendingChanges
    pendingChanges = 0
    debounceTimer = null
    if (inFlight !== null) {
      // Already running — let it finish; the next debounce window will catch up
      opts.log.info(
        { event: 'watch:skip', trigger: triggerPath },
        'watch: scan in flight, skipping',
      )
      return
    }
    opts.log.info(
      { event: 'watch:rescan', trigger: triggerPath, changesCollected: collected },
      `watch: rescan (${collected} change${collected === 1 ? '' : 's'} collected)`,
    )
    inFlight = runOneShotScan({ root, log: opts.log })
    try {
      await inFlight
    } catch (err) {
      opts.log.error({ err }, 'watch: rescan failed')
    } finally {
      inFlight = null
    }
  }

  // Wire chokidar events
  watcher.on('all', (event: string, path: string) => {
    if (event === 'addDir' || event === 'unlinkDir') return
    scheduleRescan(path)
  })

  return {
    async stop() {
      if (debounceTimer !== null) {
        clearTimeout(debounceTimer)
        debounceTimer = null
      }
      await watcher.close()
    },
    triggerChange(path) {
      scheduleRescan(path)
    },
  }
}
