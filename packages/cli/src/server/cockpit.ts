import { existsSync } from 'node:fs'
import { resolve } from 'node:path'
import {
  type SnapshotReader,
  createSnapshotReader,
  scan,
  writeSnapshotAtomic,
} from '@codearch/core'
import type { Logger } from 'pino'
import { createAgentEventsTailer } from './activity/agent-events-tailer.js'
import { createActivityTailer } from './activity/tailer.js'
import { type HttpServerHandle, createHttpServer } from './http-server.js'
import { listenWithFallback } from './port-fallback.js'
import { type WsEventBus, createWsEventBus } from './ws-bus.js'
import { type WebSocketServerHandle, attachWebSocketServer } from './ws-server.js'

export interface StartCockpitOptions {
  /** Realpath-normalized project root. */
  projectRoot: string
  /** Preferred port. Default 3099. */
  port?: number
  /** When true, --port was set explicitly — no fallback. */
  explicitPort?: boolean
  /** Skip the browser-open call. Default false. */
  noOpen?: boolean
  /** Force a scan before serving even if graph.json exists. Default false. */
  rescan?: boolean
  /** Logger. */
  log: Logger
  /**
   * Test seam — override the open() implementation. Defaults to dynamically
   * imported `open` package. Tests inject a spy to verify --no-open + URL.
   */
  openFn?: (url: string) => Promise<void>
}

export interface CockpitHandle {
  /** Port the server bound to. */
  port: number
  /** Base URL (http://localhost:<port>). */
  url: string
  /** Event bus for emitting scan progress. */
  bus: WsEventBus
  /** Snapshot reader (caller can re-use). */
  reader: SnapshotReader
  /** Stop the cockpit (HTTP + WS) cleanly. */
  stop(): Promise<void>
}

/**
 * Launch the Vibe Graph cockpit:
 *   1. Construct SnapshotReader
 *   2. Maybe scan (no graph.json or --rescan)
 *   3. Start HTTP + WS on a port (3099 with fallback)
 *   4. Optionally open browser
 *
 * Returns a handle the caller can use to query the bound port and stop the
 * cockpit on shutdown.
 */
export async function startCockpit(opts: StartCockpitOptions): Promise<CockpitHandle> {
  const snapshotPath = resolve(opts.projectRoot, '.vibegraph/cache/graph.json')
  const bus = createWsEventBus()

  const tailer = createActivityTailer({
    projectRoot: opts.projectRoot,
    broadcast: (event) => bus.emit(event),
  })
  await tailer.start()

  const eventsTailer = createAgentEventsTailer({
    projectRoot: opts.projectRoot,
    broadcast: (event) => bus.emit(event),
  })
  await eventsTailer.start()

  // Build trigger function for the reader + manual scans
  const triggerScan = async (): Promise<void> => {
    bus.emit({ type: 'scan:start', at: new Date().toISOString() })
    const startedAt = Date.now()
    try {
      const snap = await scan({ root: opts.projectRoot })
      await writeSnapshotAtomic(snapshotPath, snap)
      bus.emit({
        type: 'scan:complete',
        builtAt: snap.meta.builtAt,
        durationMs: Date.now() - startedAt,
        scanId: snap.meta.scanId,
      })
      bus.emit({ type: 'graph:updated', scanId: snap.meta.scanId })
    } catch (err) {
      const code =
        err instanceof Error && 'code' in err
          ? String((err as { code: unknown }).code)
          : 'SCAN_ERROR'
      const message = err instanceof Error ? err.message : String(err)
      bus.emit({ type: 'scan:error', code, message })
      throw err
    }
  }

  const reader = createSnapshotReader({
    snapshotPath,
    autoScanOnMissing: true,
    triggerScan,
  })

  // Eagerly scan if --rescan or no graph.json
  const hasGraph = existsSync(snapshotPath)
  if (opts.rescan === true || !hasGraph) {
    opts.log.info(
      { rescan: opts.rescan === true, hasGraph },
      'cockpit: running scan before serving',
    )
    await triggerScan()
    reader.invalidate() // ensure next get() reads the freshly-written file
  }

  // Build HTTP server with route context
  const httpHandle: HttpServerHandle = createHttpServer({
    ctx: {
      reader,
      projectRoot: opts.projectRoot,
      triggerScan,
    },
    log: opts.log,
  })

  // Bind with port fallback
  const preferredPort = opts.port ?? 3099
  const explicit = opts.explicitPort ?? false
  await listenWithFallback({
    server: httpHandle.server,
    preferredPort,
    explicit,
  })
  // Read the actual port from the server (important when preferredPort=0 → OS assigns ephemeral)
  const address = httpHandle.server.address()
  if (address === null || typeof address === 'string') {
    throw new Error('server.address() returned invalid value after listen')
  }
  const port = address.port
  const url = `http://localhost:${port}`

  // Attach WebSocket server to the bound HTTP server
  const wsHandle: WebSocketServerHandle = attachWebSocketServer({
    httpServer: httpHandle.server,
    bus,
  })

  opts.log.info({ port, url, fallback: port !== preferredPort }, `cockpit: listening on ${url}`)

  // Maybe open browser
  if (opts.noOpen !== true) {
    try {
      const opener = opts.openFn ?? (await defaultOpenFn())
      await opener(url)
    } catch (err) {
      opts.log.warn({ err }, 'cockpit: failed to open browser (continuing anyway)')
    }
  }

  return {
    port,
    url,
    bus,
    reader,
    async stop(): Promise<void> {
      await tailer.stop()
      await eventsTailer.stop()
      await wsHandle.close()
      await httpHandle.close()
    },
  }
}

/** Default opener — dynamically imports `open` to keep cold path fast. */
async function defaultOpenFn(): Promise<(url: string) => Promise<void>> {
  const mod = (await import('open')) as { default: (url: string) => Promise<unknown> }
  return async (url: string) => {
    await mod.default(url)
  }
}
