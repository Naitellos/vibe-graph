import { mkdir, writeFile } from 'node:fs/promises'
import { tmpdir } from 'node:os'
import { join } from 'node:path'
import { SnapshotSchema, buildLoadedSnapshot } from '@codearch/core'
import { describe, expect, it } from 'vitest'
import { ToolError } from '../errors.js'
import { GetSubsystemDocTool } from './get-subsystem-doc.js'

// ---- fixture helpers --------------------------------------------------------

const makeSnap = (projectRoot: string) =>
  SnapshotSchema.parse({
    meta: {
      schemaVersion: '0.1.0',
      scanId: '22222222-2222-4222-8222-222222222222',
      builtAt: '2026-05-26T00:00:00.000Z',
      projectRoot,
      projectName: 'demo',
      vibegraphVersion: '0.0.0',
      scanDurationMs: 1,
      fileCounts: { scanned: 4, indexed: 4, skipped: 0 },
    },
    nodes: [
      { id: 'subsystem:payments', kind: 'subsystem', title: 'Payments', layer: 'domain' },
      { id: 'subsystem:auth', kind: 'subsystem', title: 'Auth', layer: 'domain' },
      { id: 'file:src/payments/charge.ts', kind: 'file', title: 'charge.ts' },
      { id: 'file:src/payments/invoice.ts', kind: 'file', title: 'invoice.ts' },
    ],
    edges: [
      // payments → auth (depends_on, ast-derived — NOT yaml)
      {
        id: 'e1',
        from: 'subsystem:payments',
        to: 'subsystem:auth',
        kind: 'depends_on',
        source: 'derived',
        confidence: 'high',
        evidenceIds: [],
        runtimeWeight: 3,
        typeOnlyWeight: 0,
        dynamicWeight: 0,
        weight: 3,
      },
      // auth → payments (depends_on, yaml — should be excluded from astDependsOn)
      {
        id: 'e2',
        from: 'subsystem:auth',
        to: 'subsystem:payments',
        kind: 'depends_on',
        source: 'yaml',
        confidence: 'medium',
        evidenceIds: [],
        runtimeWeight: 0,
        typeOnlyWeight: 1,
        dynamicWeight: 0,
        weight: 1,
      },
      // contains: payments → charge.ts, invoice.ts
      {
        id: 'c1',
        from: 'subsystem:payments',
        to: 'file:src/payments/charge.ts',
        kind: 'contains',
        source: 'derived',
        confidence: 'high',
      },
      {
        id: 'c2',
        from: 'subsystem:payments',
        to: 'file:src/payments/invoice.ts',
        kind: 'contains',
        source: 'derived',
        confidence: 'high',
      },
    ],
    evidence: [],
    findings: [
      // drift finding involving payments — open
      {
        id: 'f1',
        domain: 'drift',
        type: 'drift-mismatch',
        detectorId: 'core/drift',
        severity: 'medium',
        title: 'payments drift',
        summary: 'Declared deps differ from AST',
        involvedNodeIds: ['subsystem:payments'],
        status: 'open',
      },
      // drift finding involving payments — accepted
      {
        id: 'f2',
        domain: 'drift',
        type: 'drift-mismatch',
        detectorId: 'core/drift',
        severity: 'low',
        title: 'payments drift 2',
        summary: 'Minor drift accepted',
        involvedNodeIds: ['subsystem:payments'],
        status: 'accepted',
      },
      // architecture finding — should NOT count as drift
      {
        id: 'f3',
        domain: 'architecture',
        type: 'cycle',
        detectorId: 'core/cycles',
        severity: 'high',
        title: 'cycle',
        summary: 'cycle detected',
        involvedNodeIds: ['subsystem:payments', 'subsystem:auth'],
      },
    ],
  })

async function makeProjectRoot(): Promise<string> {
  const dir = join(tmpdir(), `vibegraph-test-${Date.now()}-${Math.random().toString(36).slice(2)}`)
  const subsystemsDir = join(dir, '.vibegraph', 'subsystems')
  await mkdir(subsystemsDir, { recursive: true })

  const paymentsYaml = `
id: payments
title: Payments
layer: domain
status: shipped
description: Handles all payment processing flows.
last_verified: "2026-05-01"
verified_by: alice
match:
  - src/payments/**
depends_on:
  - auth
consumed_by: []
schema_tables:
  - payments
  - invoices
related_specs:
  - spec/payments.md
related_decisions:
  - adr/001-payment-gateway.md
memory_refs:
  - docs/payments-context.md
`.trim()

  await writeFile(join(subsystemsDir, 'payments.yml'), paymentsYaml, 'utf-8')
  return dir
}

// ---- mock reader factory ----------------------------------------------------

function makeMockReader(projectRoot: string) {
  const snap = makeSnap(projectRoot)
  const loaded = buildLoadedSnapshot(snap)
  return {
    async get() {
      return loaded
    },
    invalidate() {},
  }
}

// ---- tests ------------------------------------------------------------------

describe('get_subsystem_doc', () => {
  it('returns rich doc for existing subsystem with curated YAML', async () => {
    const projectRoot = await makeProjectRoot()
    const reader = makeMockReader(projectRoot)

    const result = await GetSubsystemDocTool.handler(
      { slug: 'payments' },
      { reader, projectRoot: '/tmp/test' },
    )

    // curated fields from YAML
    expect(result.id).toBe('payments')
    expect(result.title).toBe('Payments')
    expect(result.layer).toBe('domain')
    expect(result.status).toBe('shipped')
    expect(result.description).toBe('Handles all payment processing flows.')
    expect(result.lastVerified).toBe('2026-05-01')
    expect(result.verifiedBy).toBe('alice')
    expect(result.match).toEqual(['src/payments/**'])
    expect(result.declaredDependsOn).toEqual(['auth'])
    expect(result.declaredConsumedBy).toEqual([])
    expect(result.schemaTables).toEqual(['payments', 'invoices'])
    expect(result.relatedSpecs).toEqual(['spec/payments.md'])
    expect(result.relatedDecisions).toEqual(['adr/001-payment-gateway.md'])
    expect(result.memoryRefs).toEqual(['docs/payments-context.md'])

    // computed: ast-derived deps (source !== 'yaml')
    // payments → auth via 'derived' edge → should appear in astDependsOn
    expect(result.astDependsOn).toEqual(['auth'])
    // auth → payments via 'yaml' edge → should NOT appear in astConsumedBy
    expect(result.astConsumedBy).toEqual([])

    // computed: ownedFilesCount — 2 contains edges from payments
    expect(result.ownedFilesCount).toBe(2)

    // computed: driftSummary — 1 open, 1 accepted, 0 ignored
    expect(result.driftSummary).toEqual({ open: 1, accepted: 1, ignored: 0 })
  })

  it('throws TARGET_NOT_FOUND ToolError for unknown slug', async () => {
    const projectRoot = await makeProjectRoot()
    const reader = makeMockReader(projectRoot)

    await expect(
      GetSubsystemDocTool.handler({ slug: 'nonexistent' }, { reader, projectRoot: '/tmp/test' }),
    ).rejects.toSatisfy((err: unknown) => {
      return err instanceof ToolError && err.code === 'TARGET_NOT_FOUND'
    })
  })

  it('input schema rejects missing slug (INVALID_INPUT Zod failure)', () => {
    // The MCP server turns Zod parse failures into INVALID_INPUT. Verify the
    // schema itself rejects the empty object so the server path is guaranteed
    // to fire for this case.
    const result = GetSubsystemDocTool.inputSchema.safeParse({})
    expect(result.success).toBe(false)
    if (!result.success) {
      const paths = result.error.issues.map((i) => i.path[0])
      expect(paths).toContain('slug')
    }
  })

  it('output validates against output schema', async () => {
    const projectRoot = await makeProjectRoot()
    const reader = makeMockReader(projectRoot)

    const result = await GetSubsystemDocTool.handler(
      { slug: 'payments' },
      { reader, projectRoot: '/tmp/test' },
    )
    const parsed = GetSubsystemDocTool.outputSchema.safeParse(result)

    expect(parsed.success).toBe(true)
  })
})
