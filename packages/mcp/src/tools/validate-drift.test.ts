import { SnapshotSchema, buildLoadedSnapshot } from '@codearch/core'
import { describe, expect, it } from 'vitest'
import { ValidateDriftTool } from './validate-drift.js'

// ---- fixture helpers --------------------------------------------------------

const makeSnap = () =>
  SnapshotSchema.parse({
    meta: {
      schemaVersion: '0.1.0',
      scanId: '33333333-3333-4333-8333-333333333333',
      builtAt: '2026-05-26T00:00:00.000Z',
      projectRoot: '/tmp/validate-drift-test',
      projectName: 'demo',
      vibegraphVersion: '0.0.0',
      scanDurationMs: 1,
      fileCounts: { scanned: 4, indexed: 4, skipped: 0 },
    },
    nodes: [
      { id: 'subsystem:payments', kind: 'subsystem', title: 'Payments', layer: 'domain' },
      { id: 'subsystem:auth', kind: 'subsystem', title: 'Auth', layer: 'domain' },
      { id: 'file:src/payments/charge.ts', kind: 'file', title: 'charge.ts' },
    ],
    edges: [],
    evidence: [],
    findings: [
      // drift:stale — payments
      {
        id: 'drift:stale:payments-stale',
        domain: 'drift',
        type: 'stale',
        detectorId: 'core/drift',
        severity: 'medium',
        title: 'Payments stale dep',
        summary: 'Declared dep is stale',
        involvedNodeIds: ['subsystem:payments'],
        status: 'open',
      },
      // drift:undeclared — payments
      {
        id: 'drift:undeclared:payments-undeclared',
        domain: 'drift',
        type: 'undeclared',
        detectorId: 'core/drift',
        severity: 'high',
        title: 'Payments undeclared dep',
        summary: 'AST dep not declared',
        involvedNodeIds: ['subsystem:payments'],
        status: 'open',
      },
      // drift:unowned — auth (different subsystem)
      {
        id: 'drift:unowned:auth-unowned',
        domain: 'drift',
        type: 'unowned',
        detectorId: 'core/drift',
        severity: 'low',
        title: 'Auth unowned file',
        summary: 'File unowned by any subsystem',
        involvedNodeIds: ['subsystem:auth'],
        status: 'open',
      },
      // drift:stale — payments, but accepted
      {
        id: 'drift:stale:payments-stale-accepted',
        domain: 'drift',
        type: 'stale',
        detectorId: 'core/drift',
        severity: 'low',
        title: 'Payments stale dep (accepted)',
        summary: 'Declared dep accepted as stale',
        involvedNodeIds: ['subsystem:payments'],
        status: 'accepted',
      },
      // drift:undeclared — payments, but ignored
      {
        id: 'drift:undeclared:payments-undeclared-ignored',
        domain: 'drift',
        type: 'undeclared',
        detectorId: 'core/drift',
        severity: 'low',
        title: 'Payments undeclared dep (ignored)',
        summary: 'AST dep ignored',
        involvedNodeIds: ['subsystem:payments'],
        status: 'ignored',
      },
      // architecture finding — should NOT appear in drift results
      {
        id: 'arch:cycle:1',
        domain: 'architecture',
        type: 'cycle',
        detectorId: 'core/cycles',
        severity: 'high',
        title: 'Cycle',
        summary: 'cycle detected',
        involvedNodeIds: ['subsystem:payments', 'subsystem:auth'],
      },
    ],
  })

function makeMockReader() {
  const snap = makeSnap()
  const loaded = buildLoadedSnapshot(snap)
  return {
    async get() {
      return loaded
    },
    invalidate() {},
  }
}

// ---- tests ------------------------------------------------------------------

describe('validate_drift', () => {
  it('no slug returns all drift findings (excluding accepted/ignored by default)', async () => {
    const reader = makeMockReader()
    const result = await ValidateDriftTool.handler({}, { reader, projectRoot: '/tmp/test' })

    // Only open drift findings: payments-stale, payments-undeclared, auth-unowned
    expect(result.stale).toHaveLength(1)
    expect(result.undeclared).toHaveLength(1)
    expect(result.unowned).toHaveLength(1)

    // Architecture finding must NOT appear
    const allIds = [...result.stale, ...result.undeclared, ...result.unowned].map((f) => f.id)
    expect(allIds).not.toContain('arch:cycle:1')

    // No accepted/ignored
    expect(allIds).not.toContain('drift:stale:payments-stale-accepted')
    expect(allIds).not.toContain('drift:undeclared:payments-undeclared-ignored')
  })

  it('with slug returns drift findings for that subsystem only', async () => {
    const reader = makeMockReader()
    const result = await ValidateDriftTool.handler(
      { slug: 'payments' },
      { reader, projectRoot: '/tmp/test' },
    )

    // Only payments findings (stale + undeclared open), auth-unowned excluded
    expect(result.stale).toHaveLength(1)
    expect(result.stale[0]?.id).toBe('drift:stale:payments-stale')

    expect(result.undeclared).toHaveLength(1)
    expect(result.undeclared[0]?.id).toBe('drift:undeclared:payments-undeclared')

    // auth-unowned must NOT appear
    expect(result.unowned).toHaveLength(0)
  })

  it('unknown slug returns empty lists (not error)', async () => {
    const reader = makeMockReader()

    // Must NOT throw
    const result = await ValidateDriftTool.handler(
      { slug: 'nonexistent' },
      { reader, projectRoot: '/tmp/test' },
    )

    expect(result.stale).toHaveLength(0)
    expect(result.undeclared).toHaveLength(0)
    expect(result.unowned).toHaveLength(0)
    expect(result.summary.total).toBe(0)
    expect(result.summary.stale).toBe(0)
    expect(result.summary.undeclared).toBe(0)
    expect(result.summary.unowned).toBe(0)
  })

  it('summary counts match listed findings', async () => {
    const reader = makeMockReader()
    const result = await ValidateDriftTool.handler({}, { reader, projectRoot: '/tmp/test' })

    expect(result.summary.stale).toBe(result.stale.length)
    expect(result.summary.undeclared).toBe(result.undeclared.length)
    expect(result.summary.unowned).toBe(result.unowned.length)
    expect(result.summary.total).toBe(
      result.stale.length + result.undeclared.length + result.unowned.length,
    )
  })

  it('includeAccepted: true includes accepted and ignored findings', async () => {
    const reader = makeMockReader()

    const withAccepted = await ValidateDriftTool.handler(
      { includeAccepted: true },
      { reader, projectRoot: '/tmp/test' },
    )
    const withoutAccepted = await ValidateDriftTool.handler(
      {},
      { reader, projectRoot: '/tmp/test' },
    )

    // With includeAccepted: more stale (accepted) + more undeclared (ignored)
    expect(withAccepted.stale.length).toBeGreaterThan(withoutAccepted.stale.length)
    expect(withAccepted.undeclared.length).toBeGreaterThan(withoutAccepted.undeclared.length)

    const withAllIds = [
      ...withAccepted.stale,
      ...withAccepted.undeclared,
      ...withAccepted.unowned,
    ].map((f) => f.id)

    expect(withAllIds).toContain('drift:stale:payments-stale-accepted')
    expect(withAllIds).toContain('drift:undeclared:payments-undeclared-ignored')
  })
})
