import { URLSearchParams } from 'node:url'
import {
  type LoadedSnapshot,
  type SnapshotReader,
  SnapshotSchema,
  buildLoadedSnapshot,
} from '@codearch/core'
import { describe, expect, it, vi } from 'vitest'
import {
  blastRadiusRoute,
  contextPackRoute,
  evidenceRoute,
  findingStatusRoute,
  findingsRoute,
  healthRoute,
  nodeRoute,
  overviewRoute,
  scanRoute,
  searchRoute,
  snapshotRoute,
  subsystemDocSlugRoute,
  subsystemDocsListRoute,
} from './routes.js'

function makeSnap(): LoadedSnapshot {
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
        fileCounts: { scanned: 2, indexed: 2, skipped: 0 },
      },
      nodes: [
        { id: 'subsystem:a', kind: 'subsystem', title: 'A', layer: 'domain' },
        { id: 'subsystem:b', kind: 'subsystem', title: 'B', layer: 'domain' },
        { id: 'file:src/a.ts', kind: 'file', title: 'a.ts' },
      ],
      edges: [
        {
          id: 'e1',
          from: 'subsystem:a',
          to: 'subsystem:b',
          kind: 'depends_on',
          source: 'derived',
          confidence: 'high',
          evidenceIds: ['ev1'],
        },
      ],
      evidence: [
        {
          id: 'ev1',
          sourceKind: 'ast',
          file: 'src/a.ts',
          detail: 'import b',
          confidence: 'high',
        },
      ],
      findings: [
        {
          id: 'f1',
          domain: 'architecture',
          type: 'cycle',
          detectorId: 'core/cycles',
          severity: 'high',
          title: 'cycle a/b',
          summary: 'auth-billing cycle',
          involvedNodeIds: ['subsystem:a', 'subsystem:b'],
        },
      ],
    }),
  )
}

function makeStubReader(loaded: LoadedSnapshot): SnapshotReader {
  return {
    get: async () => loaded,
    invalidate: () => {},
  }
}

const ctx = {
  reader: makeStubReader(makeSnap()),
  projectRoot: '/abs',
  triggerScan: async () => {},
}

const emptyReq = (
  path = '/api/x',
): { method: 'GET'; pathname: string; query: URLSearchParams } => ({
  method: 'GET',
  pathname: path,
  query: new URLSearchParams(),
})

describe('healthRoute', () => {
  it('returns 200 + ok:true', async () => {
    const r = await healthRoute(ctx, emptyReq('/api/health'))
    expect(r.status).toBe(200)
    const body = r.body as { ok: boolean; version: string }
    expect(body.ok).toBe(true)
    expect(typeof body.version).toBe('string')
  })
})

describe('snapshotRoute', () => {
  it('returns the raw snapshot', async () => {
    const r = await snapshotRoute(ctx, emptyReq('/api/snapshot'))
    expect(r.status).toBe(200)
    const body = r.body as { meta: { projectName: string } }
    expect(body.meta.projectName).toBe('demo')
  })
})

describe('overviewRoute', () => {
  it('returns counts for the fixture', async () => {
    const r = await overviewRoute(ctx, emptyReq('/api/overview'))
    expect(r.status).toBe(200)
    const body = r.body as { counts: { subsystems: number; files: number } }
    expect(body.counts.subsystems).toBe(2)
    expect(body.counts.files).toBe(1)
  })
})

describe('findingsRoute', () => {
  it('returns all findings without filter', async () => {
    const r = await findingsRoute(ctx, emptyReq('/api/findings'))
    expect(r.status).toBe(200)
    const body = r.body as { findings: unknown[] }
    expect(body.findings).toHaveLength(1)
  })

  it('filters by severity', async () => {
    const query = new URLSearchParams({ severity: 'low' })
    const r = await findingsRoute(ctx, { method: 'GET', pathname: '/api/findings', query })
    expect(r.status).toBe(200)
    const body = r.body as { findings: unknown[] }
    expect(body.findings).toHaveLength(0)
  })

  it('filters by domain', async () => {
    const query = new URLSearchParams({ domain: 'architecture' })
    const r = await findingsRoute(ctx, { method: 'GET', pathname: '/api/findings', query })
    const body = r.body as { findings: unknown[] }
    expect(body.findings).toHaveLength(1)
  })
})

describe('nodeRoute', () => {
  it('400 when id missing', async () => {
    const r = await nodeRoute(ctx, emptyReq('/api/node'))
    expect(r.status).toBe(400)
  })

  it('404 when id not found', async () => {
    const query = new URLSearchParams({ id: 'subsystem:nope' })
    const r = await nodeRoute(ctx, { method: 'GET', pathname: '/api/node', query })
    expect(r.status).toBe(404)
  })

  it('returns node + edges when found', async () => {
    const query = new URLSearchParams({ id: 'subsystem:a' })
    const r = await nodeRoute(ctx, { method: 'GET', pathname: '/api/node', query })
    expect(r.status).toBe(200)
    const body = r.body as { node: { id: string }; outgoing: unknown[]; incoming: unknown[] }
    expect(body.node.id).toBe('subsystem:a')
    expect(body.outgoing).toHaveLength(1)
    expect(body.incoming).toHaveLength(0)
  })
})

describe('blastRadiusRoute', () => {
  it('400 when target missing', async () => {
    const r = await blastRadiusRoute(ctx, emptyReq('/api/blast-radius'))
    expect(r.status).toBe(400)
  })

  it('404 when target not found', async () => {
    const query = new URLSearchParams({ target: 'subsystem:nope' })
    const r = await blastRadiusRoute(ctx, { method: 'GET', pathname: '/api/blast-radius', query })
    expect(r.status).toBe(404)
  })

  it('returns radius for valid target', async () => {
    const query = new URLSearchParams({ target: 'subsystem:b' })
    const r = await blastRadiusRoute(ctx, { method: 'GET', pathname: '/api/blast-radius', query })
    expect(r.status).toBe(200)
    const body = r.body as { target: { nodeId: string }; direct: string[]; totalAffected: number }
    expect(body.target.nodeId).toBe('subsystem:b')
  })
})

describe('evidenceRoute', () => {
  it('400 when id missing', async () => {
    const r = await evidenceRoute(ctx, emptyReq('/api/evidence'))
    expect(r.status).toBe(400)
  })

  it('404 when id not found', async () => {
    const query = new URLSearchParams({ id: 'ev:nope' })
    const r = await evidenceRoute(ctx, { method: 'GET', pathname: '/api/evidence', query })
    expect(r.status).toBe(404)
  })

  it('returns evidence when found', async () => {
    const query = new URLSearchParams({ id: 'ev1' })
    const r = await evidenceRoute(ctx, { method: 'GET', pathname: '/api/evidence', query })
    expect(r.status).toBe(200)
    const body = r.body as { id: string; file: string }
    expect(body.id).toBe('ev1')
  })
})

describe('searchRoute', () => {
  it('400 when q missing', async () => {
    const r = await searchRoute(ctx, emptyReq('/api/search'))
    expect(r.status).toBe(400)
  })

  it('returns nodes matching id or title (case-insensitive)', async () => {
    const query = new URLSearchParams({ q: 'a' })
    const r = await searchRoute(ctx, { method: 'GET', pathname: '/api/search', query })
    expect(r.status).toBe(200)
    const body = r.body as { nodes: Array<{ id: string }> }
    expect(body.nodes.length).toBeGreaterThan(0)
    expect(body.nodes.some((n) => n.id === 'subsystem:a')).toBe(true)
  })
})

describe('scanRoute', () => {
  it('calls triggerScan and returns scan summary', async () => {
    let scanCalled = false
    const stubCtx = {
      reader: makeStubReader(makeSnap()),
      projectRoot: '/abs',
      triggerScan: async () => {
        scanCalled = true
      },
    }
    const r = await scanRoute(stubCtx, {
      method: 'POST',
      pathname: '/api/scan',
      query: new URLSearchParams(),
    })
    expect(scanCalled).toBe(true)
    expect(r.status).toBe(200)
    const body = r.body as { ok: boolean; scanId: string; counts: { nodes: number } }
    expect(body.ok).toBe(true)
    expect(body.counts.nodes).toBeGreaterThan(0)
  })
})

describe('contextPackRoute', () => {
  // contextPack requires real filesystem (reads file excerpts); use the simple-cycle fixture
  it('400 when target missing', async () => {
    const r = await contextPackRoute(ctx, emptyReq('/api/context-pack'))
    expect(r.status).toBe(400)
  })

  it('404 when target not found', async () => {
    const query = new URLSearchParams({ target: 'subsystem:nope' })
    const r = await contextPackRoute(ctx, { method: 'GET', pathname: '/api/context-pack', query })
    expect(r.status).toBe(404)
  })

  // Full success-path test is in http-server.test.ts where we use a real fixture
})

// ─── subsystem-docs routes ─────────────────────────────────────────────────

vi.mock('@codearch/core', async (importOriginal) => {
  const original = await importOriginal<typeof import('@codearch/core')>()
  return {
    ...original,
    loadSubsystemDocs: vi.fn(),
    writeBaselineEntry: vi.fn(),
  }
})

import { loadSubsystemDocs, writeBaselineEntry } from '@codearch/core'

const stubDocs = [
  {
    id: 'auth',
    title: 'Auth',
    layer: 'domain' as const,
    status: 'active' as const,
    description: 'Authentication subsystem',
    match: ['src/auth/**'],
    depends_on: [],
    consumed_by: [],
    schema_tables: [],
    related_specs: [],
    related_decisions: [],
    memory_refs: [],
  },
  {
    id: 'billing',
    title: 'Billing',
    layer: 'domain' as const,
    status: 'active' as const,
    description: 'Billing subsystem',
    match: ['src/billing/**'],
    depends_on: ['auth'],
    consumed_by: [],
    schema_tables: [],
    related_specs: [],
    related_decisions: [],
    memory_refs: [],
  },
]

describe('subsystemDocsListRoute', () => {
  it('returns the array of subsystem docs', async () => {
    vi.mocked(loadSubsystemDocs).mockResolvedValue({
      docs: stubDocs,
      dirPath: '/abs/.vibegraph/subsystems',
      filesByDoc: new Map(),
    })
    const r = await subsystemDocsListRoute(ctx, emptyReq('/api/subsystem-docs'))
    expect(r.status).toBe(200)
    const body = r.body as { docs: Array<{ id: string }> }
    expect(body.docs).toHaveLength(2)
    expect(body.docs[0]?.id).toBe('auth')
    expect(body.docs[1]?.id).toBe('billing')
  })

  it('returns empty array when no subsystem dir', async () => {
    vi.mocked(loadSubsystemDocs).mockResolvedValue({
      docs: [],
      dirPath: undefined,
      filesByDoc: new Map(),
    })
    const r = await subsystemDocsListRoute(ctx, emptyReq('/api/subsystem-docs'))
    expect(r.status).toBe(200)
    const body = r.body as { docs: unknown[] }
    expect(body.docs).toHaveLength(0)
  })
})

describe('subsystemDocSlugRoute', () => {
  it('returns rich doc for valid slug', async () => {
    vi.mocked(loadSubsystemDocs).mockResolvedValue({
      docs: stubDocs,
      dirPath: '/abs/.vibegraph/subsystems',
      filesByDoc: new Map(),
    })
    const r = await subsystemDocSlugRoute(ctx, emptyReq('/api/subsystem-docs/a'))
    // node 'subsystem:a' exists in the fixture
    expect(r.status).toBe(200)
    const body = r.body as { id: string; title: string; driftSummary: { open: number } }
    expect(body.id).toBe('a')
    expect(typeof body.title).toBe('string')
    expect(typeof body.driftSummary.open).toBe('number')
  })

  it('returns 404 for unknown slug', async () => {
    vi.mocked(loadSubsystemDocs).mockResolvedValue({
      docs: stubDocs,
      dirPath: '/abs/.vibegraph/subsystems',
      filesByDoc: new Map(),
    })
    const r = await subsystemDocSlugRoute(ctx, emptyReq('/api/subsystem-docs/no-such-slug'))
    expect(r.status).toBe(404)
  })
})

// ─── findingStatusRoute ────────────────────────────────────────────────────

describe('findingStatusRoute', () => {
  it('400 when status is invalid', async () => {
    vi.mocked(writeBaselineEntry).mockResolvedValue(undefined)
    const r = await findingStatusRoute(ctx, {
      method: 'POST',
      pathname: '/api/findings/f1/status',
      query: new URLSearchParams(),
      body: { status: 'pending' },
    })
    expect(r.status).toBe(400)
  })

  it('400 when body is missing', async () => {
    const r = await findingStatusRoute(ctx, {
      method: 'POST',
      pathname: '/api/findings/f1/status',
      query: new URLSearchParams(),
      body: undefined,
    })
    expect(r.status).toBe(400)
  })

  it('writes baseline and returns ok:true for valid accepted status', async () => {
    vi.mocked(writeBaselineEntry).mockResolvedValue(undefined)
    const r = await findingStatusRoute(ctx, {
      method: 'POST',
      pathname: '/api/findings/f1/status',
      query: new URLSearchParams(),
      body: { status: 'accepted', note: 'intentional' },
    })
    expect(r.status).toBe(200)
    const body = r.body as { ok: boolean }
    expect(body.ok).toBe(true)
    expect(vi.mocked(writeBaselineEntry)).toHaveBeenCalledWith('/abs', {
      findingId: 'f1',
      status: 'accepted',
      note: 'intentional',
    })
  })

  it('writes baseline and returns ok:true for ignored status', async () => {
    vi.mocked(writeBaselineEntry).mockResolvedValue(undefined)
    const r = await findingStatusRoute(ctx, {
      method: 'POST',
      pathname: '/api/findings/f2/status',
      query: new URLSearchParams(),
      body: { status: 'ignored' },
    })
    expect(r.status).toBe(200)
    const body = r.body as { ok: boolean }
    expect(body.ok).toBe(true)
    expect(vi.mocked(writeBaselineEntry)).toHaveBeenCalledWith('/abs', {
      findingId: 'f2',
      status: 'ignored',
      note: undefined,
    })
  })
})
