import { describe, expect, it } from 'vitest'
import { type WsEvent, createWsEventBus } from './ws-bus.js'

describe('createWsEventBus', () => {
  it('subscriber receives subsequent emits in order', () => {
    const bus = createWsEventBus()
    const received: WsEvent[] = []
    bus.subscribe((e) => received.push(e))
    bus.emit({ type: 'scan:start', at: '2026-05-25T00:00:00.000Z' })
    bus.emit({ type: 'scan:progress', stage: 'discover' })
    bus.emit({
      type: 'scan:complete',
      builtAt: '2026-05-25T00:00:05.000Z',
      durationMs: 5000,
      scanId: '11111111-1111-4111-8111-111111111111',
    })
    expect(received).toHaveLength(3)
    expect(received[0]?.type).toBe('scan:start')
    expect(received[1]?.type).toBe('scan:progress')
    expect(received[2]?.type).toBe('scan:complete')
  })

  it('multiple subscribers all receive each emit', () => {
    const bus = createWsEventBus()
    const a: WsEvent[] = []
    const b: WsEvent[] = []
    bus.subscribe((e) => a.push(e))
    bus.subscribe((e) => b.push(e))
    bus.emit({ type: 'graph:updated', scanId: 'x' })
    expect(a).toHaveLength(1)
    expect(b).toHaveLength(1)
  })

  it('subscribers added after emit do NOT receive past events (no replay)', () => {
    const bus = createWsEventBus()
    bus.emit({ type: 'scan:start', at: 'past' })
    const received: WsEvent[] = []
    bus.subscribe((e) => received.push(e))
    expect(received).toHaveLength(0)
  })

  it('unsubscribe() stops further deliveries', () => {
    const bus = createWsEventBus()
    const received: WsEvent[] = []
    const unsub = bus.subscribe((e) => received.push(e))
    bus.emit({ type: 'graph:updated', scanId: 'a' })
    unsub()
    bus.emit({ type: 'graph:updated', scanId: 'b' })
    expect(received).toHaveLength(1)
    expect((received[0] as { scanId: string }).scanId).toBe('a')
  })

  it('subscriberCount reflects active subscribers', () => {
    const bus = createWsEventBus()
    expect(bus.subscriberCount()).toBe(0)
    const u1 = bus.subscribe(() => {})
    const u2 = bus.subscribe(() => {})
    expect(bus.subscriberCount()).toBe(2)
    u1()
    expect(bus.subscriberCount()).toBe(1)
    u2()
    expect(bus.subscriberCount()).toBe(0)
  })

  it('one subscriber throwing does not stop others', () => {
    const bus = createWsEventBus()
    let bGot = false
    bus.subscribe(() => {
      throw new Error('boom')
    })
    bus.subscribe(() => {
      bGot = true
    })
    bus.emit({ type: 'graph:updated', scanId: 'x' })
    expect(bGot).toBe(true)
  })

  it('emits typed events with all required fields', () => {
    const bus = createWsEventBus()
    const received: WsEvent[] = []
    bus.subscribe((e) => received.push(e))
    // Exercise all 5 event types
    bus.emit({ type: 'scan:start', at: 'iso' })
    bus.emit({ type: 'scan:progress', stage: 'merge', percent: 50 })
    bus.emit({ type: 'scan:complete', builtAt: 'iso', durationMs: 100, scanId: 'sid' })
    bus.emit({ type: 'scan:error', code: 'EFAIL', message: 'bad' })
    bus.emit({ type: 'graph:updated', scanId: 'sid' })
    expect(received.map((e) => e.type)).toEqual([
      'scan:start',
      'scan:progress',
      'scan:complete',
      'scan:error',
      'graph:updated',
    ])
  })

  it("broadcasts 'activity' event and subscriber receives it with correct entry id", () => {
    const bus = createWsEventBus()
    const received: WsEvent[] = []
    bus.subscribe((e) => received.push(e))
    bus.emit({
      type: 'activity',
      entry: {
        id: '1-aa',
        ts: 1,
        tool: 'prepare_task',
        durationMs: 0,
        status: 'ok',
        argsRedacted: '{}',
        redactions: 0,
        truncated: false,
      },
    })
    expect(received).toHaveLength(1)
    expect(received[0]).toMatchObject({ type: 'activity' })
    expect((received[0] as Extract<WsEvent, { type: 'activity' }>).entry.id).toBe('1-aa')
  })
})
