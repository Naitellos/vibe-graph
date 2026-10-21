import { type Server, createServer } from 'node:http'
import { afterEach, describe, expect, it } from 'vitest'
import { listenWithFallback } from './port-fallback.js'

/** Track every server created so we can close them in afterEach. */
const created: Server[] = []

function makeServer(): Server {
  const s = createServer((_, res) => {
    res.statusCode = 200
    res.end()
  })
  created.push(s)
  return s
}

async function closeServer(s: Server): Promise<void> {
  return new Promise((resolveFn) => {
    if (!s.listening) {
      resolveFn()
      return
    }
    s.close(() => resolveFn())
  })
}

async function tryListen(s: Server, port: number): Promise<boolean> {
  return new Promise((resolveFn) => {
    const cleanup = (): void => {
      s.removeListener('error', onError)
      s.removeListener('listening', onListening)
    }
    const onError = (): void => {
      cleanup()
      resolveFn(false)
    }
    const onListening = (): void => {
      cleanup()
      resolveFn(true)
    }
    s.once('error', onError)
    s.once('listening', onListening)
    s.listen(port)
  })
}

/**
 * Reserve a consecutive block so assertions do not depend on random ports
 * being free on the developer machine. Callers can close the tail servers to
 * create a known fallback boundary while the prefix stays occupied.
 */
async function occupyConsecutivePorts(
  count: number,
): Promise<{ start: number; servers: Server[] }> {
  for (let attempt = 0; attempt < 100; attempt++) {
    const start = 51_000 + Math.floor(Math.random() * (8_000 - count))
    const servers: Server[] = []
    let complete = true

    for (let offset = 0; offset < count; offset++) {
      const server = makeServer()
      servers.push(server)
      if (!(await tryListen(server, start + offset))) {
        complete = false
        break
      }
    }

    if (complete) return { start, servers }
    for (const server of servers) await closeServer(server)
  }

  throw new Error(`Unable to reserve ${count} consecutive test ports`)
}

afterEach(async () => {
  for (const s of created.splice(0)) {
    await closeServer(s)
  }
})

describe('listenWithFallback', () => {
  it('binds to preferredPort when free', async () => {
    const reserved = await occupyConsecutivePorts(1)
    await closeServer(reserved.servers[0])
    const server = makeServer()
    const preferredPort = reserved.start
    const result = await listenWithFallback({ server, preferredPort })
    expect(result.port).toBe(preferredPort)
    expect(result.usedFallback).toBe(false)
  })

  it('falls through to next port when preferredPort is busy', async () => {
    const reserved = await occupyConsecutivePorts(2)
    const preferredPort = reserved.start
    await closeServer(reserved.servers[1])

    const server = makeServer()
    const result = await listenWithFallback({ server, preferredPort })
    expect(result.port).toBe(preferredPort + 1)
    expect(result.usedFallback).toBe(true)
  })

  it('explicit=true throws when port is busy', async () => {
    const reserved = await occupyConsecutivePorts(1)
    const preferredPort = reserved.start

    const server = makeServer()
    await expect(listenWithFallback({ server, preferredPort, explicit: true })).rejects.toThrow(
      /already in use/,
    )
  })

  it('throws when all fallback ports are busy', async () => {
    const reserved = await occupyConsecutivePorts(3)
    const preferredPort = reserved.start
    const maxPort = preferredPort + 2 // small window for the test

    const server = makeServer()
    await expect(listenWithFallback({ server, preferredPort, maxPort })).rejects.toThrow(
      /All ports in/,
    )
  })

  it('walks multiple busy ports until finding a free one', async () => {
    const reserved = await occupyConsecutivePorts(4)
    const preferredPort = reserved.start
    await closeServer(reserved.servers[3])

    const server = makeServer()
    const result = await listenWithFallback({ server, preferredPort })
    expect(result.port).toBe(preferredPort + 3)
    expect(result.usedFallback).toBe(true)
  })

  it('rethrows non-EADDRINUSE errors as-is', async () => {
    const server = makeServer()
    // Port 0 is "any free port" — but using a negative port forces EACCES on most systems
    // We can also force this by passing an invalid port
    await expect(listenWithFallback({ server, preferredPort: -1 })).rejects.toThrow()
  })
})
