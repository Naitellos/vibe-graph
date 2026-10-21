import type { Server as HttpServer } from 'node:http'
import { type WebSocket, WebSocketServer } from 'ws'
import type { WsEventBus } from './ws-bus.js'

export interface AttachWebSocketServerOptions {
  /** HTTP server to attach to (shares the same port). */
  httpServer: HttpServer
  /** Event bus to broadcast from. */
  bus: WsEventBus
  /** WS upgrade path. Default '/ws'. */
  path?: string
}

export interface WebSocketServerHandle {
  /** Underlying WebSocketServer instance. */
  wss: WebSocketServer
  /** Number of currently-open connections. */
  connectionCount(): number
  /** Close the WSS (does not close the underlying HTTP server). */
  close(): Promise<void>
}

/**
 * Attach a WebSocket server to an existing HTTP server. Each connecting client
 * subscribes to the bus and receives events as line-delimited JSON.
 *
 * Connection lifecycle:
 *   - on 'connection': subscribe to bus, store unsubscribe handle on the socket
 *   - on 'close': call unsubscribe to clean up
 *   - on bus event: send JSON.stringify(event) to the open socket
 */
export function attachWebSocketServer(opts: AttachWebSocketServerOptions): WebSocketServerHandle {
  const path = opts.path ?? '/ws'
  const wss = new WebSocketServer({ server: opts.httpServer, path })
  const openSockets = new Set<WebSocket>()

  wss.on('connection', (socket: WebSocket) => {
    openSockets.add(socket)
    const unsubscribe = opts.bus.subscribe((event) => {
      if (socket.readyState === socket.OPEN) {
        socket.send(JSON.stringify(event))
      }
    })
    socket.on('close', () => {
      openSockets.delete(socket)
      unsubscribe()
    })
    socket.on('error', () => {
      // Swallow per-socket errors — the close handler will run for cleanup
    })
  })

  return {
    wss,
    connectionCount(): number {
      return openSockets.size
    },
    async close(): Promise<void> {
      // Close all open sockets, then close the WSS
      for (const s of openSockets) {
        try {
          s.close()
        } catch {
          // best-effort
        }
      }
      openSockets.clear()
      return new Promise((resolveFn, rejectFn) => {
        wss.close((err) => {
          if (err !== undefined) rejectFn(err)
          else resolveFn()
        })
      })
    },
  }
}
