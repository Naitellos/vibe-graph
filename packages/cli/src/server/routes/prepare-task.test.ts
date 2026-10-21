vi.mock('@codearch/core', async (orig) => {
  const actual = await orig<typeof import('@codearch/core')>()
  return { ...actual, prepareTask: vi.fn(), writeTaskSession: vi.fn() }
})

import {
  type PrepareTaskOutput,
  SnapshotSchema,
  buildLoadedSnapshot,
  prepareTask,
  writeTaskSession,
} from '@codearch/core'
import { beforeEach, describe, expect, it, vi } from 'vitest'
import type { RouteContext, RouteRequest } from '../types.js'
import { prepareTaskRoute } from './prepare-task.js'

// ---------------------------------------------------------------------------
// Fixture helpers
// ---------------------------------------------------------------------------

function makeLoadedSnapshot() {
  return buildLoadedSnapshot(
    SnapshotSchema.parse({
      meta: {
        schemaVersion: '0.1.0',
        scanId: '55555555-5555-5555-8555-555555555555',
        builtAt: '2026-05-27T00:00:00.000Z',
        projectRoot: '/tmp/prepare-task-route-test',
        projectName: 'test',
        vibegraphVersion: '0.0.0',
        scanDurationMs: 1,
        fileCounts: { scanned: 1, indexed: 1, skipped: 0 },
      },
      nodes: [
        { id: 'subsystem:payments', kind: 'subsystem', title: 'Payments', layer: 'domain' },
        { id: 'file:server/services/payment.ts', kind: 'file', title: 'payment.ts' },
      ],
      edges: [
        {
          id: 'e1',
          from: 'subsystem:payments',
          to: 'file:server/services/payment.ts',
          kind: 'contains',
          source: 'derived',
          confidence: 'high',
          category: 'domain',
          weight: 1,
        },
      ],
      evidence: [],
      findings: [],
    }),
  )
}

function makeCtx(opts: { snapshotLoaded: boolean }): RouteContext {
  return {
    projectRoot: '/tmp/fake',
    reader: {
      get: vi.fn(() =>
        opts.snapshotLoaded
          ? Promise.resolve(makeLoadedSnapshot())
          : Promise.reject(new Error('NO_SNAPSHOT')),
      ),
    },
    triggerScan: vi.fn(),
  } as unknown as RouteContext
}

// body is PRE-PARSED (object, not a JSON string)
function makeReq(body: unknown): RouteRequest {
  return {
    method: 'POST',
    pathname: '/api/prepare-task',
    body,
    query: new URLSearchParams(),
  } as RouteRequest
}

// ---------------------------------------------------------------------------
// Error path tests
// ---------------------------------------------------------------------------

describe('POST /api/prepare-task — error paths', () => {
  it('returns 400 when intent is missing', async () => {
    const res = await prepareTaskRoute(
      makeCtx({ snapshotLoaded: true }),
      makeReq({ paths: ['x'], mode: 'refactor' }),
    )
    expect(res.status).toBe(400)
    expect((res.body as { ok: boolean }).ok).toBe(false)
  })

  it('returns 400 when paths is empty (schema .min(1))', async () => {
    const res = await prepareTaskRoute(
      makeCtx({ snapshotLoaded: true }),
      makeReq({ intent: 'x', paths: [], mode: 'refactor' }),
    )
    expect(res.status).toBe(400)
    expect((res.body as { ok: boolean }).ok).toBe(false)
  })

  it('returns 400 when body is undefined (missing POST body)', async () => {
    const res = await prepareTaskRoute(makeCtx({ snapshotLoaded: true }), makeReq(undefined))
    expect(res.status).toBe(400)
    expect((res.body as { ok: boolean }).ok).toBe(false)
  })

  it('returns 500 when snapshot reader rejects', async () => {
    const res = await prepareTaskRoute(
      makeCtx({ snapshotLoaded: false }),
      makeReq({ intent: 'x', paths: ['a.ts'], mode: 'refactor' }),
    )
    expect(res.status).toBe(500)
    expect((res.body as { ok: boolean }).ok).toBe(false)
    expect((res.body as { error: string }).error).toMatch(/snapshot/i)
  })
})

// ---------------------------------------------------------------------------
// Reset mocks between tests to prevent call-count bleed
// ---------------------------------------------------------------------------

beforeEach(() => {
  vi.clearAllMocks()
})

// ---------------------------------------------------------------------------
// Fixture helpers for mocked prepareTask output
// ---------------------------------------------------------------------------

const BASE_INPUT = {
  intent: 'refactor payment service',
  paths: ['server/services/payment.ts'],
  mode: 'refactor' as const,
}

function makeOutput(): PrepareTaskOutput {
  return {
    taskId: 'task_2026-05-28_abcd1234',
    createdAt: '2026-05-28T00:00:00.000Z',
    target: { subsystems: ['payments'], files: ['server/services/payment.ts'] },
    summary: 'Working on payments.',
    risks: [],
    rules: [],
    doNotDo: [],
    requiredContext: { files: [], schemaTables: [], relatedAdrs: [] },
    recommendations: [],
    tests: [],
    baselineSnapshotId: '55555555-5555-5555-8555-555555555555',
  }
}

// ---------------------------------------------------------------------------
// Happy path tests
// ---------------------------------------------------------------------------

describe('POST /api/prepare-task — happy path', () => {
  it('returns 200 with ok:true and data when valid input and snapshot available', async () => {
    const output = makeOutput()
    vi.mocked(prepareTask).mockResolvedValue(output)
    vi.mocked(writeTaskSession).mockResolvedValue(undefined)

    const res = await prepareTaskRoute(makeCtx({ snapshotLoaded: true }), makeReq(BASE_INPUT))
    expect(res.status).toBe(200)
    expect((res.body as { ok: boolean }).ok).toBe(true)
    const data = (res.body as { ok: boolean; data: unknown }).data
    expect(data).toBeDefined()
    expect(typeof (data as { taskId: string }).taskId).toBe('string')
  })

  it('persists TaskSession with matching taskId, intent, paths, mode', async () => {
    const output = makeOutput()
    vi.mocked(prepareTask).mockResolvedValue(output)
    vi.mocked(writeTaskSession).mockResolvedValue(undefined)

    await prepareTaskRoute(makeCtx({ snapshotLoaded: true }), makeReq(BASE_INPUT))

    expect(writeTaskSession).toHaveBeenCalledOnce()
    expect(writeTaskSession).toHaveBeenCalledWith('/tmp/prepare-task-route-test', {
      taskId: output.taskId,
      intent: BASE_INPUT.intent,
      paths: BASE_INPUT.paths,
      mode: BASE_INPUT.mode,
      baselineSnapshotId: output.baselineSnapshotId,
      createdAt: output.createdAt,
    })
  })

  it('writeTaskSession rejection is non-fatal: still returns 200', async () => {
    const output = makeOutput()
    vi.mocked(prepareTask).mockResolvedValue(output)
    vi.mocked(writeTaskSession).mockRejectedValue(new Error('disk full'))

    const res = await prepareTaskRoute(makeCtx({ snapshotLoaded: true }), makeReq(BASE_INPUT))
    expect(res.status).toBe(200)
    expect((res.body as { ok: boolean }).ok).toBe(true)
    expect((res.body as { ok: boolean; data: { taskId: string } }).data.taskId).toBe(output.taskId)
  })
})
