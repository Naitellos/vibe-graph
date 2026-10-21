/**
 * ws-bus.ts — UI-side WebSocket bus
 *
 * Connects to the cockpit WS endpoint, dispatches typed events to subscribers,
 * and invalidates SWR caches on `graph:updated`.
 *
 * ## Design notes
 *
 * ### No global singleton
 * The bus is created per-hook-instance inside `useWsBus()`.  A `useRef` holds
 * it stable across re-renders; `useEffect` cleanup calls `bus.close()` and
 * resets `busRef.current` to `null` so that a React Strict Mode remount
 * creates a fresh bus rather than reusing the destroyed one.
 *
 * ### Invalidation keys
 * On `graph:updated` the bus calls `invalidate` with the full list of keys /
 * prefixes considered stale:
 *   - Exact keys:  `/api/snapshot`, `/api/overview`
 *   - Prefix keys: `/api/findings`, `/api/node`, `/api/blast-radius`
 *
 * The hook (`useWsBus`) implements `invalidate` using SWR's predicate-matcher
 * form: `mutate(key => prefixes.some(p => key.startsWith(p)), undefined,
 * { revalidate: true })`.
 */

import type { ActivityEntry, ValidateDiffUiPayload } from '@codearch/core'
import { useEffect, useRef } from 'react'
import { useSWRConfig } from 'swr'
import { useActivityLogStore } from './activity-log.js'
import { useDiffStore } from './diff.js'

// ─── Public types ─────────────────────────────────────────────────────────────

/** Matches the server-side contract in packages/cli/src/server/ws-bus.ts */
export type WsEvent =
  | { type: 'scan:start'; at: string }
  | { type: 'scan:progress'; stage: string; percent?: number }
  | { type: 'scan:complete'; builtAt: string; durationMs: number; scanId: string }
  | { type: 'scan:error'; code: string; message: string }
  | { type: 'graph:updated'; scanId: string }
  | { type: 'activity'; entry: ActivityEntry }
  | { type: 'validate:diff'; payload: ValidateDiffUiPayload }

export type WsEventType = WsEvent['type']
export type WsListener = (event: WsEvent) => void

export interface WsBusClient {
  /** Subscribe to all events. Returns an unsubscribe function. */
  subscribe(cb: WsListener): () => void
  /** Number of currently registered listeners. Useful for tests. */
  listenerCount(): number
  /** Permanently close the socket and cancel any pending reconnect. */
  close(): void
  /** Observable connection state. */
  readonly state: 'connecting' | 'open' | 'closed' | 'reconnecting'
}

export interface CreateWsBusOptions {
  /** WebSocket endpoint URL, e.g. `ws://localhost:3000/ws`. */
  url: string
  /**
   * Called whenever a `graph:updated` event fires.
   *
   * Receives the full list of cache keys / prefixes to invalidate:
   * `['/api/snapshot', '/api/overview', '/api/findings', '/api/node', '/api/blast-radius']`
   *
   * The caller is responsible for deciding whether to treat entries as exact
   * keys or prefix matchers.  `useWsBus()` uses SWR's predicate-matcher form
   * (`mutate(key => …)`) so that parameterised URLs (e.g. `/api/findings?domain=security`)
   * are also invalidated.
   */
  invalidate: (keys: string[]) => void
  /**
   * Inject a WebSocket constructor for testing.
   * Defaults to `globalThis.WebSocket`.
   */
  WebSocketCtor?: typeof WebSocket
  /** Base reconnect delay in milliseconds. Default: 1000. */
  baseDelayMs?: number
  /** Maximum reconnect delay cap in milliseconds. Default: 30000. */
  maxDelayMs?: number
}

// ─── Keys invalidated on graph:updated ───────────────────────────────────────

/**
 * All cache keys (exact or prefix) that are stale after a graph update.
 * Exact keys: /api/snapshot, /api/overview.
 * Prefix keys: /api/findings, /api/node, /api/blast-radius
 * (these match parameterised variants like /api/findings?domain=security).
 */
const INVALIDATE_KEYS = [
  '/api/snapshot',
  '/api/overview',
  '/api/findings',
  '/api/node',
  '/api/blast-radius',
] as const

// ─── Implementation ───────────────────────────────────────────────────────────

export function createWsBus(opts: CreateWsBusOptions): WsBusClient {
  const { url, invalidate, baseDelayMs = 1000, maxDelayMs = 30_000 } = opts

  // Use provided ctor first, then globalThis.WebSocket (allows test injection
  // via either the option or monkey-patching globalThis).
  const globalWS = (globalThis as { WebSocket?: typeof WebSocket }).WebSocket
  if (!opts.WebSocketCtor && !globalWS) {
    throw new Error('[ws-bus] No WebSocket implementation available on globalThis.')
  }
  const WS: typeof WebSocket = (opts.WebSocketCtor ?? globalWS) as typeof WebSocket

  const listeners = new Set<WsListener>()
  let _state: WsBusClient['state'] = 'connecting'
  let socket: WebSocket | null = null
  let attempt = 0
  let reconnectTimer: ReturnType<typeof setTimeout> | null = null
  let destroyed = false

  function getState(): WsBusClient['state'] {
    return _state
  }

  function dispatch(event: WsEvent): void {
    for (const cb of listeners) {
      try {
        cb(event)
      } catch {
        // Isolated — one bad listener doesn't kill others.
      }
    }
  }

  function handleGraphUpdated(): void {
    invalidate([...INVALIDATE_KEYS])
  }

  function connect(): void {
    if (destroyed) return
    _state = 'connecting'
    const ws = new WS(url)
    socket = ws

    ws.onopen = () => {
      if (destroyed) {
        ws.close()
        return
      }
      attempt = 0
      _state = 'open'
    }

    ws.onmessage = (ev: MessageEvent<string>) => {
      let parsed: unknown
      try {
        parsed = JSON.parse(ev.data)
      } catch {
        if (import.meta.env.DEV) {
          console.warn('[ws-bus] Failed to parse message; dropping frame.')
        }
        return
      }

      if (
        parsed === null ||
        typeof parsed !== 'object' ||
        !('type' in parsed) ||
        typeof (parsed as Record<string, unknown>).type !== 'string'
      ) {
        return
      }

      const event = parsed as WsEvent

      if (event.type === 'graph:updated') {
        handleGraphUpdated()
      }

      if (event.type === 'activity') {
        useActivityLogStore.getState().receiveLive(event.entry)
      }

      if (event.type === 'validate:diff') {
        useDiffStore.getState().receiveAgentDelta(event.payload)
      }

      dispatch(event)
    }

    ws.onclose = (ev: CloseEvent) => {
      if (destroyed) return
      // Code 1000 = normal close (triggered by our own bus.close()); don't reconnect.
      if (ev.code === 1000) return

      _state = 'reconnecting'
      const delay = Math.min(baseDelayMs * 2 ** attempt, maxDelayMs)
      attempt += 1
      reconnectTimer = setTimeout(() => {
        reconnectTimer = null
        if (!destroyed) connect()
      }, delay)
    }

    ws.onerror = () => {
      // Errors are followed by a close event; let onclose handle reconnect.
    }
  }

  // Kick off initial connection.
  connect()

  return {
    get state() {
      return getState()
    },
    subscribe(cb: WsListener): () => void {
      listeners.add(cb)
      return () => {
        listeners.delete(cb)
      }
    },
    listenerCount(): number {
      return listeners.size
    },
    close(): void {
      destroyed = true
      _state = 'closed'
      if (reconnectTimer !== null) {
        clearTimeout(reconnectTimer)
        reconnectTimer = null
      }
      const sock = socket
      socket = null
      if (sock === null) return
      // Remove message/close/error handlers so nothing dispatches or reconnects.
      sock.onmessage = null
      sock.onclose = null
      sock.onerror = null
      if (sock.readyState === WebSocket.CONNECTING) {
        // Closing a still-CONNECTING socket makes the browser log
        // "WebSocket is closed before the connection is established" — noisy under
        // React StrictMode's dev mount→unmount→remount. Defer the close until it
        // opens so we close an OPEN socket (no warning). destroyed=true keeps the
        // bus inert in the meantime.
        sock.onopen = () => {
          try {
            sock.close(1000)
          } catch {
            // Swallow — socket may already be closing.
          }
        }
        return
      }
      sock.onopen = null
      try {
        sock.close(1000)
      } catch {
        // Swallow — socket may already be closed.
      }
    },
  }
}

// ─── Hook ─────────────────────────────────────────────────────────────────────

/**
 * Returns a per-instance WsBusClient tied to the component lifecycle.
 *
 * Call once at App root.  On unmount the bus is permanently closed and all
 * pending reconnects are cancelled.
 */
export function useWsBus(): WsBusClient {
  const { mutate } = useSWRConfig()
  const busRef = useRef<WsBusClient | null>(null)

  if (busRef.current === null) {
    const protocol =
      typeof location !== 'undefined' && location.protocol === 'https:' ? 'wss:' : 'ws:'
    const host = typeof location !== 'undefined' ? location.host : 'localhost'
    const wsUrl = `${protocol}//${host}/ws`

    const invalidate = (keys: string[]) => {
      // Use SWR's predicate-matcher form so parameterised variants are included.
      void mutate(
        (key: unknown) => typeof key === 'string' && keys.some((p) => key.startsWith(p)),
        undefined,
        { revalidate: true },
      )
    }

    busRef.current = createWsBus({ url: wsUrl, invalidate })
  }

  useEffect(() => {
    // Capture the current bus; the cleanup runs against THIS instance.
    const bus = busRef.current
    return () => {
      bus?.close()
      // Reset so a Strict Mode remount creates a fresh bus rather than reusing
      // the closed instance (busRef.current would be non-null but destroyed).
      busRef.current = null
    }
  }, [])

  return busRef.current
}
