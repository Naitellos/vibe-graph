import {
  type LoadedSnapshot,
  type SnapshotReader,
  SnapshotSchema,
  buildLoadedSnapshot,
} from '@codearch/core'
import { describe, expect, it } from 'vitest'
import { createHttpServer } from './http-server.js'

function makeLoaded(): LoadedSnapshot {
  return buildLoadedSnapshot(
    SnapshotSchema.parse({
      meta: {
        schemaVersion: '0.1.0',
        scanId: '11111111-1111-4111-8111-111111111111',
        builtAt: '2026-05-25T00:00:00.000Z',
        projectRoot: '/abs',
        projectName: 'demo',
        vibegraphVersion: '0.0.0',
        scanDurationMs: 1,
        fileCounts: { scanned: 0, indexed: 0, skipped: 0 },
      },
      nodes: [{ id: 'subsystem:auth', kind: 'subsystem', title: 'Auth', layer: 'domain' }],
      edges: [],
      evidence: [],
      findings: [],
    }),
  )
}

function makeStubReader(loaded: LoadedSnapshot): SnapshotReader {
  return { get: async () => loaded, invalidate: () => {} }
}

describe('createHttpServer', () => {
  it('GET /api/health returns 200 with ok:true', async () => {
    const handle = createHttpServer({
      ctx: {
        reader: makeStubReader(makeLoaded()),
        projectRoot: '/abs',
        triggerScan: async () => {},
      },
    })
    const { port } = await handle.listen(0)
    try {
      const resp = await fetch(`http://localhost:${port}/api/health`)
      expect(resp.status).toBe(200)
      expect(resp.headers.get('content-type')).toContain('application/json')
      const body = (await resp.json()) as { ok: boolean }
      expect(body.ok).toBe(true)
    } finally {
      await handle.close()
    }
  })

  it('404 on unknown route', async () => {
    const handle = createHttpServer({
      ctx: {
        reader: makeStubReader(makeLoaded()),
        projectRoot: '/abs',
        triggerScan: async () => {},
      },
    })
    const { port } = await handle.listen(0)
    try {
      const resp = await fetch(`http://localhost:${port}/api/no-such-route`)
      expect(resp.status).toBe(404)
    } finally {
      await handle.close()
    }
  })

  it('405-equivalent 404 for wrong method', async () => {
    const handle = createHttpServer({
      ctx: {
        reader: makeStubReader(makeLoaded()),
        projectRoot: '/abs',
        triggerScan: async () => {},
      },
    })
    const { port } = await handle.listen(0)
    try {
      const resp = await fetch(`http://localhost:${port}/api/health`, { method: 'POST' })
      expect(resp.status).toBe(404) // POST not registered for /api/health
    } finally {
      await handle.close()
    }
  })

  it('GET /api/snapshot returns the snapshot', async () => {
    const handle = createHttpServer({
      ctx: {
        reader: makeStubReader(makeLoaded()),
        projectRoot: '/abs',
        triggerScan: async () => {},
      },
    })
    const { port } = await handle.listen(0)
    try {
      const resp = await fetch(`http://localhost:${port}/api/snapshot`)
      expect(resp.status).toBe(200)
      const body = (await resp.json()) as { meta: { projectName: string } }
      expect(body.meta.projectName).toBe('demo')
    } finally {
      await handle.close()
    }
  })

  it('POST /api/scan triggers scan', async () => {
    let triggered = false
    const handle = createHttpServer({
      ctx: {
        reader: makeStubReader(makeLoaded()),
        projectRoot: '/abs',
        triggerScan: async () => {
          triggered = true
        },
      },
    })
    const { port } = await handle.listen(0)
    try {
      const resp = await fetch(`http://localhost:${port}/api/scan`, { method: 'POST' })
      expect(resp.status).toBe(200)
      expect(triggered).toBe(true)
    } finally {
      await handle.close()
    }
  })

  it('returns 500 with sanitized message on handler crash', async () => {
    const explodingReader: SnapshotReader = {
      get: async () => {
        throw new Error('boom')
      },
      invalidate: () => {},
    }
    const handle = createHttpServer({
      ctx: { reader: explodingReader, projectRoot: '/abs', triggerScan: async () => {} },
    })
    const { port } = await handle.listen(0)
    try {
      const resp = await fetch(`http://localhost:${port}/api/snapshot`)
      expect(resp.status).toBe(500)
      const body = (await resp.json()) as { error: string; message: string }
      expect(body.error).toBe('INTERNAL_ERROR')
      expect(body.message).toBe('boom')
    } finally {
      await handle.close()
    }
  })

  it('GET / returns HTML (not JSON-wrapped)', async () => {
    const handle = createHttpServer({
      ctx: {
        reader: makeStubReader(makeLoaded()),
        projectRoot: '/abs',
        triggerScan: async () => {},
      },
    })
    const { port } = await handle.listen(0)
    try {
      const resp = await fetch(`http://localhost:${port}/`)
      expect(resp.status).toBe(200)
      expect(resp.headers.get('content-type')).toContain('text/html')
      const body = await resp.text()
      expect(body).toContain('Vibe Graph')
      // Confirm it's NOT JSON-wrapped
      expect(body.startsWith('{')).toBe(false)
    } finally {
      await handle.close()
    }
  })

  it('GET /assets/foo.js returns 404 with JSON body when UI not built', async () => {
    const handle = createHttpServer({
      ctx: {
        reader: makeStubReader(makeLoaded()),
        projectRoot: '/abs',
        triggerScan: async () => {},
      },
    })
    const { port } = await handle.listen(0)
    try {
      const resp = await fetch(`http://localhost:${port}/assets/main.js`)
      expect(resp.status).toBe(404)
      // Error response is JSON
      expect(resp.headers.get('content-type')).toContain('application/json')
      const body = (await resp.json()) as { error: string }
      expect(body.error).toBe('UI_NOT_BUILT')
    } finally {
      await handle.close()
    }
  })
})
