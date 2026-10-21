import { closeSync, mkdirSync, openSync, readSync, renameSync, statSync } from 'node:fs'
import { dirname, join } from 'node:path'
import { type ValidateDiffUiPayload, ValidateDiffUiPayloadSchema } from '@codearch/core'
import chokidar, { type FSWatcher } from 'chokidar'

const DEFAULT_ROTATE_BYTES = 10 * 1024 * 1024
const STABILITY_THRESHOLD = 50
const POLL_INTERVAL = 10

type Broadcast = (event: { type: 'validate:diff'; payload: ValidateDiffUiPayload }) => void
export interface AgentEventsTailerOptions {
  projectRoot: string
  broadcast: Broadcast
  rotateAtBytes?: number
}
export interface AgentEventsTailer {
  start(): Promise<void>
  stop(): Promise<void>
}

export function createAgentEventsTailer(opts: AgentEventsTailerOptions): AgentEventsTailer {
  const logPath = join(opts.projectRoot, '.vibegraph/cache/agent-events.ndjson')
  const rotateBytes = opts.rotateAtBytes ?? DEFAULT_ROTATE_BYTES
  let watcher: FSWatcher | null = null
  let lastReadOffset = 0
  let residualBuffer = ''

  function readNewBytes(): string {
    let size: number
    try {
      size = statSync(logPath).size
    } catch {
      return ''
    }
    if (size < lastReadOffset) {
      // file truncated or rotated+recreated smaller than our offset — restart from byte 0
      lastReadOffset = 0
      residualBuffer = ''
    }
    const length = size - lastReadOffset
    if (length <= 0) return '' // no new bytes (size === lastReadOffset, or empty file)
    const fd = openSync(logPath, 'r')
    try {
      const buf = Buffer.alloc(length)
      readSync(fd, buf, 0, length, lastReadOffset)
      return buf.toString('utf8')
    } finally {
      closeSync(fd)
    }
  }
  // Single chunk processor. Offset model: readNewBytes returns [lastReadOffset, EOF); we prepend the
  // in-memory residualBuffer (incomplete tail of a prior read, already on disk behind the offset so never
  // re-read), consume up to the last '\n', keep the new tail as residual, and advance offset by the
  // freshly-read chunk's byte length.
  function processChunk(chunk: string): void {
    const combined = residualBuffer + chunk
    const lastNewline = combined.lastIndexOf('\n')
    let consumed: string
    if (lastNewline < 0) {
      residualBuffer = combined
      consumed = ''
    } else {
      consumed = combined.slice(0, lastNewline + 1)
      residualBuffer = combined.slice(lastNewline + 1)
    }
    // Always advance the offset by the freshly-read chunk length so residualBuffer
    // bytes are never re-read on subsequent calls (they are held in-memory only).
    lastReadOffset += Buffer.byteLength(chunk, 'utf8')
    if (consumed.length === 0) return
    for (const line of consumed.split('\n').filter((l) => l.length > 0)) {
      let parsed: ValidateDiffUiPayload
      try {
        parsed = ValidateDiffUiPayloadSchema.parse(JSON.parse(line))
      } catch {
        continue
      }
      opts.broadcast({ type: 'validate:diff', payload: parsed })
    }
  }
  function maybeRotate(): void {
    let size: number
    try {
      size = statSync(logPath).size
    } catch {
      return
    }
    if (size <= rotateBytes) return
    try {
      renameSync(logPath, `${logPath}.1`)
    } catch {
      return
    }
    lastReadOffset = 0
    residualBuffer = ''
  }
  return {
    async start() {
      mkdirSync(dirname(logPath), { recursive: true })
      try {
        lastReadOffset = statSync(logPath).size
      } catch {
        lastReadOffset = 0
      }
      const w = chokidar.watch(logPath, {
        awaitWriteFinish: { stabilityThreshold: STABILITY_THRESHOLD, pollInterval: POLL_INTERVAL },
        ignoreInitial: true,
      })
      watcher = w
      const handle = () => {
        const chunk = readNewBytes()
        if (chunk.length > 0) processChunk(chunk)
        maybeRotate()
      }
      w.on('add', () => {
        lastReadOffset = 0
        residualBuffer = ''
        handle()
      })
      w.on('change', handle)
      // Wait for ready + a short grace so the OS-level file watch is active.
      // On macOS, chokidar emits 'ready' via process.nextTick but kqueue/FSEvents
      // needs one extra event-loop turn before writes are reliably detected.
      await new Promise<void>((resolve) => {
        w.on('ready', () => setTimeout(resolve, 10))
      })
    },
    async stop() {
      if (watcher !== null) {
        await watcher.close()
        watcher = null
      }
    },
  }
}
