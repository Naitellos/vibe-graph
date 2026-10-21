import { type Server, createServer } from 'node:http'
import { describe, expect, it } from 'vitest'
import { WebSocket } from 'ws'
import { type WsEvent, createWsEventBus } from './ws-bus.js'
import { attachWebSocketServer } from './ws-server.js'

async function startHttp(): Promise<{ server: Server; port: number }> {
  const server = createServer((_, res) => {
    res.statusCode = 404
    res.end()
  })
  await new Promise<void>((resolveFn) => server.listen(0, resolveFn))
  const addr = server.address()
  if (addr === null || typeof addr === 'string') throw new Error('bad address')
  return { server, port: addr.port }
}

async function closeHttp(server: Server): Promise<void> {
  return new Promise((resolveFn, rejectFn) => {
    server.close((err) => (err !== undefined ? rejectFn(err) : resolveFn()))
  })
}

describe('attachWebSocketServer', () => {
  it('client receives bus events as JSON over /ws', async () => {
    const { server, port } = await startHttp()
    const bus = createWsEventBus()
    const handle = attachWebSocketServer({ httpServer: server, bus })

    try {
      // Connect client
      const client = new WebSocket(`ws://localhost:${port}/ws`)
      await new Promise<void>((resolveFn, rejectFn) => {
        client.once('open', () => resolveFn())
        client.once('error', rejectFn)
      })
      expect(handle.connectionCount()).toBe(1)

      const received: WsEvent[] = []
      client.on('message', (data: Buffer) => {
        received.push(JSON.parse(data.toString('utf-8')) as WsEvent)
      })

      // Emit a few events
      bus.emit({ type: 'scan:start', at: '2026-05-25T00:00:00.000Z' })
      bus.emit({ type: 'scan:progress', stage: 'discover', percent: 25 })
      bus.emit({
        type: 'scan:complete',
        builtAt: '2026-05-25T00:00:01.000Z',
        durationMs: 1000,
        scanId: '11111111-1111-4111-8111-111111111111',
      })

      // Wait for messages
      await new Promise<void>((resolveFn) => setTimeout(resolveFn, 100))

      expect(received).toHaveLength(3)
      expect(received[0]?.type).toBe('scan:start')
      expect(received[1]?.type).toBe('scan:progress')
      expect(received[2]?.type).toBe('scan:complete')

      client.close()
    } finally {
      await handle.close()
      await closeHttp(server)
    }
  })

  it('subscriberCount drops when client closes', async () => {
    const { server, port } = await startHttp()
    const bus = createWsEventBus()
    const handle = attachWebSocketServer({ httpServer: server, bus })

    try {
      const client = new WebSocket(`ws://localhost:${port}/ws`)
      await new Promise<void>((resolveFn, rejectFn) => {
        client.once('open', () => resolveFn())
        client.once('error', rejectFn)
      })
      expect(bus.subscriberCount()).toBe(1)

      client.close()
      // Wait for close event to propagate server-side
      await new Promise<void>((resolveFn) => setTimeout(resolveFn, 100))
      expect(bus.subscriberCount()).toBe(0)
    } finally {
      await handle.close()
      await closeHttp(server)
    }
  })

  it('multiple clients all receive the same events', async () => {
    const { server, port } = await startHttp()
    const bus = createWsEventBus()
    const handle = attachWebSocketServer({ httpServer: server, bus })

    try {
      const c1 = new WebSocket(`ws://localhost:${port}/ws`)
      const c2 = new WebSocket(`ws://localhost:${port}/ws`)
      await Promise.all([
        new Promise<void>((r, rj) => {
          c1.once('open', () => r())
          c1.once('error', rj)
        }),
        new Promise<void>((r, rj) => {
          c2.once('open', () => r())
          c2.once('error', rj)
        }),
      ])
      expect(bus.subscriberCount()).toBe(2)

      const r1: WsEvent[] = []
      const r2: WsEvent[] = []
      c1.on('message', (d: Buffer) => r1.push(JSON.parse(d.toString('utf-8')) as WsEvent))
      c2.on('message', (d: Buffer) => r2.push(JSON.parse(d.toString('utf-8')) as WsEvent))

      bus.emit({ type: 'graph:updated', scanId: 'sid' })
      await new Promise<void>((r) => setTimeout(r, 100))

      expect(r1).toHaveLength(1)
      expect(r2).toHaveLength(1)

      c1.close()
      c2.close()
    } finally {
      await handle.close()
      await closeHttp(server)
    }
  })

  it('handle.close() disconnects all clients', async () => {
    const { server, port } = await startHttp()
    const bus = createWsEventBus()
    const handle = attachWebSocketServer({ httpServer: server, bus })

    try {
      const client = new WebSocket(`ws://localhost:${port}/ws`)
      await new Promise<void>((resolveFn, rejectFn) => {
        client.once('open', () => resolveFn())
        client.once('error', rejectFn)
      })
      expect(handle.connectionCount()).toBe(1)

      await handle.close()
      // Wait for close to propagate
      await new Promise<void>((resolveFn) => setTimeout(resolveFn, 100))
      expect(client.readyState).toBe(WebSocket.CLOSED)
    } finally {
      await closeHttp(server)
    }
  })
})
