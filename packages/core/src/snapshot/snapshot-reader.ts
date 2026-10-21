import { readFile, stat } from 'node:fs/promises'
import { type Snapshot, SnapshotSchema } from '../schema/snapshot.js'
import { type LoadedSnapshot, buildLoadedSnapshot } from './load-snapshot.js'

export type SnapshotReaderErrorCode = 'SNAPSHOT_MISSING' | 'SNAPSHOT_CORRUPT'

export class SnapshotReaderError extends Error {
  constructor(
    public readonly code: SnapshotReaderErrorCode,
    message: string,
    public readonly hint?: string,
  ) {
    super(message)
    this.name = 'SnapshotReaderError'
  }
}

export interface SnapshotReader {
  get(): Promise<LoadedSnapshot>
  invalidate(): void
}

export interface SnapshotReaderOptions {
  snapshotPath: string
  autoScanOnMissing: boolean
  /** v0 caller wires this when autoScan is desired. */
  triggerScan?: () => Promise<void>
}

export function createSnapshotReader(opts: SnapshotReaderOptions): SnapshotReader {
  let cached: LoadedSnapshot | null = null
  let cachedMtimeMs = 0
  let cachedSize = 0

  async function readFresh(): Promise<LoadedSnapshot> {
    let raw: string
    try {
      raw = await readFile(opts.snapshotPath, 'utf-8')
    } catch (err: unknown) {
      const e = err as NodeJS.ErrnoException
      if (e.code === 'ENOENT') {
        if (opts.autoScanOnMissing && opts.triggerScan) {
          await opts.triggerScan()
          return readFresh()
        }
        throw new SnapshotReaderError(
          'SNAPSHOT_MISSING',
          `No snapshot at ${opts.snapshotPath}`,
          'Run: npx vibe-graph scan',
        )
      }
      throw err
    }

    let parsed: Snapshot
    try {
      parsed = SnapshotSchema.parse(JSON.parse(raw))
    } catch (err: unknown) {
      throw new SnapshotReaderError(
        'SNAPSHOT_CORRUPT',
        `graph.json failed Zod validation: ${(err as Error).message}`,
        'Run: npx vibe-graph scan',
      )
    }
    return buildLoadedSnapshot(parsed)
  }

  return {
    async get() {
      let st: Awaited<ReturnType<typeof stat>>
      try {
        st = await stat(opts.snapshotPath)
      } catch (err: unknown) {
        if ((err as NodeJS.ErrnoException).code === 'ENOENT') {
          if (opts.autoScanOnMissing && opts.triggerScan) {
            await opts.triggerScan()
            return this.get()
          }
          throw new SnapshotReaderError(
            'SNAPSHOT_MISSING',
            `No snapshot at ${opts.snapshotPath}`,
            'Run: npx vibe-graph scan',
          )
        }
        throw err
      }

      if (cached && st.mtimeMs === cachedMtimeMs && st.size === cachedSize) {
        return cached
      }

      const loaded = await readFresh()
      if (cached && loaded.raw.meta.scanId === cached.raw.meta.scanId) {
        cachedMtimeMs = st.mtimeMs
        cachedSize = st.size
        return cached
      }

      cached = loaded
      cachedMtimeMs = st.mtimeMs
      cachedSize = st.size
      return loaded
    },
    invalidate() {
      cached = null
      cachedMtimeMs = 0
      cachedSize = 0
    },
  }
}
