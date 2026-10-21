/**
 * ws-bus.test.tsx
 *
 * Testing strategy: `globalThis.WebSocket` is monkey-patched in beforeEach /
 * afterEach so that `createWsBus` (which defaults to `globalThis.WebSocket`)
 * picks up FakeWebSocket without any additional abstraction leaking into the
 * public API.  For the hook test we rely on the same mechanism so that
 * `useWsBus()` (which calls `createWsBus` internally) also uses FakeWebSocket.
 */
import { renderHook } from '@testing-library/react'
import type { ReactNode } from 'react'
import { SWRConfig } from 'swr'
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import { useActivityLogStore } from './activity-log.js'
import { useDiffStore } from './diff.js'
import { createWsBus, useWsBus } from './ws-bus.js'

// ─── FakeWebSocket ────────────────────────────────────────────────────────────

class FakeWebSocket {
  static instances: FakeWebSocket[] = []
  url: string
  readyState = 0 // CONNECTING
  onopen: ((e: unknown) => void) | null = null
  onclose: ((e: unknown) => void) | null = null
  onmessage: ((e: { data: string }) => void) | null = null
  onerror: ((e: unknown) => void) | null = null

  constructor(url: string) {
    this.url = url
    FakeWebSocket.instances.push(this)
  }

  simulateOpen() {
    this.readyState = 1
    this.onopen?.({})
  }

  simulateMessage(payload: unknown) {
    this.onmessage?.({ data: JSON.stringify(payload) })
  }

  simulateClose(code = 1006) {
    this.readyState = 3
    this.onclose?.({ code })
  }

  close() {
    this.simulateClose(1000)
  }

  send(_: string) {}
}

// ─── Helpers ──────────────────────────────────────────────────────────────────

function patchWebSocket() {
  FakeWebSocket.instances = []
  // biome-ignore lint/suspicious/noExplicitAny: test patching
  ;(globalThis as any).WebSocket = FakeWebSocket
}

function restoreWebSocket() {
  // biome-ignore lint/suspicious/noExplicitAny: test patching
  ;(globalThis as any).WebSocket = undefined
}

function latestSocket(): FakeWebSocket {
  const s = FakeWebSocket.instances.at(-1)
  if (!s) throw new Error('No FakeWebSocket instance yet')
  return s
}

// ─── Tests ───────────────────────────────────────────────────────────────────

const TEST_URL = 'ws://localhost/ws'

beforeEach(() => {
  patchWebSocket()
  vi.useRealTimers()
  // Reset activity-log store so tests don't bleed into each other.
  useActivityLogStore.setState({ entries: [], badgeCount: 0, lastSeenTs: 0, isLoading: false })
  // Reset diff store so tests don't bleed into each other.
  useDiffStore.getState().clear()
})

afterEach(() => {
  restoreWebSocket()
})

// 1 ── Connect emits open ──────────────────────────────────────────────────────
describe('1: connect emits open', () => {
  it('state is "open" after simulateOpen', () => {
    const bus = createWsBus({ url: TEST_URL, invalidate: vi.fn() })
    expect(bus.state).toBe('connecting')
    latestSocket().simulateOpen()
    expect(bus.state).toBe('open')
    bus.close()
  })
})

// 2 ── Subscribe receives event ────────────────────────────────────────────────
describe('2: subscribe receives event', () => {
  it('listener receives dispatched event after open', () => {
    const listener = vi.fn()
    const bus = createWsBus({ url: TEST_URL, invalidate: vi.fn() })
    bus.subscribe(listener)
    latestSocket().simulateOpen()
    latestSocket().simulateMessage({ type: 'scan:start', at: '2024-01-01T00:00:00Z' })
    expect(listener).toHaveBeenCalledWith({ type: 'scan:start', at: '2024-01-01T00:00:00Z' })
    bus.close()
  })
})

// 3 ── graph:updated triggers invalidate ──────────────────────────────────────
describe('3: graph:updated triggers invalidate', () => {
  it('calls invalidate with the expected keys on graph:updated', () => {
    const invalidate = vi.fn()
    const bus = createWsBus({ url: TEST_URL, invalidate })
    latestSocket().simulateOpen()
    latestSocket().simulateMessage({ type: 'graph:updated', scanId: 'abc' })

    expect(invalidate).toHaveBeenCalledOnce()
    const keys = invalidate.mock.calls[0]?.[0] as string[]
    expect(keys).toContain('/api/snapshot')
    expect(keys).toContain('/api/overview')
    // Prefix keys for parameterised routes
    expect(keys).toContain('/api/findings')
    expect(keys).toContain('/api/node')
    expect(keys).toContain('/api/blast-radius')
    bus.close()
  })
})

// 4 ── Listeners isolated ──────────────────────────────────────────────────────
describe('4: listeners isolated', () => {
  it('a throwing listener does not prevent other listeners from receiving events', () => {
    const bus = createWsBus({ url: TEST_URL, invalidate: vi.fn() })

    const listenerA = vi.fn(() => {
      throw new Error('listener A exploded')
    })
    const listenerB = vi.fn()

    bus.subscribe(listenerA)
    bus.subscribe(listenerB)

    latestSocket().simulateOpen()
    latestSocket().simulateMessage({ type: 'scan:progress', stage: 'index', percent: 50 })

    expect(listenerB).toHaveBeenCalledOnce()
    bus.close()
  })
})

// 5 ── Reconnect with backoff ──────────────────────────────────────────────────
describe('5: reconnect with exponential backoff', () => {
  it('creates a new socket after baseDelayMs on first disconnect', () => {
    vi.useFakeTimers()
    const BASE = 500
    const bus = createWsBus({ url: TEST_URL, invalidate: vi.fn(), baseDelayMs: BASE })
    const sock0 = latestSocket()
    sock0.simulateOpen()
    sock0.simulateClose(1006)

    expect(bus.state).toBe('reconnecting')
    expect(FakeWebSocket.instances).toHaveLength(1)

    vi.advanceTimersByTime(BASE - 1)
    expect(FakeWebSocket.instances).toHaveLength(1)

    vi.advanceTimersByTime(1)
    expect(FakeWebSocket.instances).toHaveLength(2)

    // Second close — delay should be BASE * 2
    FakeWebSocket.instances[1]?.simulateClose(1006)
    vi.advanceTimersByTime(BASE * 2 - 1)
    expect(FakeWebSocket.instances).toHaveLength(2)
    vi.advanceTimersByTime(1)
    expect(FakeWebSocket.instances).toHaveLength(3)

    bus.close()
    vi.useRealTimers()
  })
})

// 6 ── Successful reconnect resets backoff ─────────────────────────────────────
describe('6: successful reconnect resets backoff', () => {
  it('after reconnecting successfully, the next reconnect delay resets to baseDelayMs', () => {
    vi.useFakeTimers()
    const BASE = 500
    const bus = createWsBus({ url: TEST_URL, invalidate: vi.fn(), baseDelayMs: BASE })

    // First connect → disconnect (attempt=1)
    latestSocket().simulateOpen()
    latestSocket().simulateClose(1006)
    vi.advanceTimersByTime(BASE) // reconnects, attempt resets on next open

    // Second socket → open (resets attempt to 0) → close
    latestSocket().simulateOpen()
    latestSocket().simulateClose(1006)

    // Advance exactly BASE — should get a third socket (delay = BASE, not BASE*4)
    vi.advanceTimersByTime(BASE - 1)
    expect(FakeWebSocket.instances).toHaveLength(2)
    vi.advanceTimersByTime(1)
    expect(FakeWebSocket.instances).toHaveLength(3)

    bus.close()
    vi.useRealTimers()
  })
})

// 7 ── close() cancels reconnect ───────────────────────────────────────────────
describe('7: close() cancels reconnect', () => {
  it('calling close() during reconnect window prevents new socket from being created', () => {
    vi.useFakeTimers()
    const BASE = 500
    const bus = createWsBus({ url: TEST_URL, invalidate: vi.fn(), baseDelayMs: BASE })

    latestSocket().simulateOpen()
    latestSocket().simulateClose(1006)

    expect(bus.state).toBe('reconnecting')

    bus.close()
    expect(bus.state).toBe('closed')

    vi.advanceTimersByTime(BASE * 10)
    expect(FakeWebSocket.instances).toHaveLength(1) // no new socket

    vi.useRealTimers()
  })
})

// 8 ── Bad JSON dropped silently ───────────────────────────────────────────────
describe('8: bad JSON dropped silently', () => {
  it('malformed message does not call listeners and bus stays open', () => {
    const listener = vi.fn()
    const bus = createWsBus({ url: TEST_URL, invalidate: vi.fn() })
    bus.subscribe(listener)
    latestSocket().simulateOpen()

    // Inject bad JSON directly via onmessage
    latestSocket().onmessage?.({ data: 'not valid json }}' })

    expect(listener).not.toHaveBeenCalled()
    expect(bus.state).toBe('open')
    bus.close()
  })
})

// 9 ── useWsBus hook integration ───────────────────────────────────────────────
describe('9: useWsBus hook integration', () => {
  function wrapper({ children }: { children: ReactNode }) {
    return (
      <SWRConfig value={{ provider: () => new Map(), dedupingInterval: 0 }}>{children}</SWRConfig>
    )
  }

  it('returns a WsBusClient that connects and cleans up on unmount', () => {
    const { result, unmount } = renderHook(() => useWsBus(), { wrapper })
    const bus = result.current

    expect(bus.state).toBe('connecting')

    // Simulate open
    latestSocket().simulateOpen()
    expect(bus.state).toBe('open')

    // Simulate a graph:updated — the hook's invalidate calls SWR mutate
    // (we can't easily assert the mutate call without deep SWR internals;
    // just assert the bus doesn't throw)
    expect(() => {
      latestSocket().simulateMessage({ type: 'graph:updated', scanId: 'abc' })
    }).not.toThrow()

    // Unmount triggers cleanup → bus.close()
    unmount()
    expect(bus.state).toBe('closed')
  })

  it('useWsBus survives unmount/remount (StrictMode cycle)', () => {
    globalThis.WebSocket = FakeWebSocket as unknown as typeof WebSocket

    // First mount + unmount (simulates Strict Mode first cycle)
    const { unmount } = renderHook(() => useWsBus(), { wrapper })
    unmount()

    // The first socket was closed by cleanup; ref was reset to null
    expect(FakeWebSocket.instances[0]?.readyState).toBe(3) // closed

    // Clear instances so we can track the next mount cleanly
    FakeWebSocket.instances.length = 0

    // Second mount (simulates Strict Mode remount) — must create a fresh bus
    const { result } = renderHook(() => useWsBus(), { wrapper })
    expect(FakeWebSocket.instances.length).toBe(1)
    expect(result.current.state).not.toBe('closed')

    result.current.close()
  })
})

// 10 ── activity event routed to useActivityLogStore ───────────────────────────
describe('10: activity event reaches useActivityLogStore.receiveLive', () => {
  it('pushes the entry into useActivityLogStore.entries when an activity message arrives', () => {
    const bus = createWsBus({ url: TEST_URL, invalidate: vi.fn() })
    latestSocket().simulateOpen()

    const entry = {
      id: '1700000000000-abc123',
      ts: 1700000000000,
      tool: 'Bash',
      durationMs: 42,
      status: 'ok' as const,
      summary: 'ran ls',
      argsRedacted: 'ls -la',
      redactions: 0,
      truncated: false,
    }

    latestSocket().simulateMessage({ type: 'activity', entry })

    expect(useActivityLogStore.getState().entries).toHaveLength(1)
    expect(useActivityLogStore.getState().entries[0]).toEqual(entry)

    bus.close()
  })
})

// 11 ── validate:diff event routed to useDiffStore ─────────────────────────────
describe('11: validate:diff event routes to useDiffStore.receiveAgentDelta', () => {
  it('sets pendingDelta in useDiffStore and does NOT auto-activate', () => {
    const bus = createWsBus({ url: TEST_URL, invalidate: vi.fn() })
    latestSocket().simulateOpen()

    const payload = {
      status: 'ok' as const,
      baselineSnapshotId: 'b',
      edges: { added: [], removed: [] },
      nodes: { added: [], removed: [] },
      blastRadius: [],
      violations: { added: [], removed: [] },
      findings: { added: [], removed: [] },
      counts: {
        addedEdges: 0,
        removedEdges: 0,
        newViolations: 0,
        removedViolations: 0,
        newFindings: 0,
        resolvedFindings: 0,
      },
    }

    latestSocket().simulateMessage({ type: 'validate:diff', payload })

    expect(useDiffStore.getState().pendingDelta).toEqual(payload)
    expect(useDiffStore.getState().active).toBe(false)

    bus.close()
  })
})
