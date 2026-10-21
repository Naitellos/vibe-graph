import { describe, expect, it } from 'vitest'
import type { Edge } from '../schema/edge.js'
import type { Node } from '../schema/node.js'
import type { Snapshot } from '../schema/snapshot.js'
import { buildLoadedSnapshot } from '../snapshot/load-snapshot.js'
import type { BoundaryRule } from './boundary.js'
import { evaluateBoundary } from './boundary.js'

// ── Test helpers ──────────────────────────────────────────────────────────────

function makeSubsystemNode(id: string): Node {
  return {
    id,
    kind: 'subsystem',
    title: id.replace(/^subsystem:/, ''),
    layer: 'unknown',
    status: 'unknown',
    tags: [],
    files: [],
    metadata: {},
  }
}

function makeEdge(from: string, to: string, kind: Edge['kind'] = 'depends_on'): Edge {
  return {
    id: `edge:${from}:${to}:${kind}`,
    from,
    to,
    kind,
    category: 'structural',
    source: 'manual',
    confidence: 'high',
    evidenceIds: [],
    weight: 1,
    runtimeWeight: 0,
    typeOnlyWeight: 0,
    dynamicWeight: 0,
    metadata: {},
  }
}

function makeSnapshot(nodes: Node[], edges: Edge[]) {
  const snap: Snapshot = {
    meta: {
      schemaVersion: '0.1.0',
      scanId: 'test-scan',
      builtAt: new Date().toISOString(),
      projectRoot: '/test',
      projectName: 'test',
      vibegraphVersion: '0.0.0',
      scanDurationMs: 0,
      fileCounts: { scanned: 0, indexed: 0, skipped: 0 },
    },
    nodes,
    edges,
    evidence: [],
    findings: [],
  }
  return buildLoadedSnapshot(snap)
}

// ── Tests ─────────────────────────────────────────────────────────────────────

describe('evaluateBoundary', () => {
  it('empty allowedFrom — every subsystem edge to protected violates', () => {
    // No subsystem is allowed to access payments
    const rule: BoundaryRule = {
      kind: 'boundary',
      id: 'payments-locked',
      title: 'Payments is fully protected',
      severity: 'high',
      mode: 'enforce',
      protectedSubsystem: 'payments',
      allowedFrom: [],
      description: '',
    }

    const nodes = [
      makeSubsystemNode('subsystem:payments'),
      makeSubsystemNode('subsystem:orders'),
      makeSubsystemNode('subsystem:api'),
    ]
    const edges = [
      makeEdge('subsystem:orders', 'subsystem:payments'),
      makeEdge('subsystem:api', 'subsystem:payments'),
    ]
    const snapshot = makeSnapshot(nodes, edges)

    const findings = evaluateBoundary(rule, { snapshot, baseline: null })

    expect(findings).toHaveLength(2)
    const ids = findings.map((f) => f.id).sort()
    expect(ids).toEqual([
      'rule:payments-locked:subsystem:api->subsystem:payments',
      'rule:payments-locked:subsystem:orders->subsystem:payments',
    ])
    // Check shape of first finding
    const f = findings.find((x) => x.id.includes('orders'))
    if (!f) throw new Error('expected finding for orders')
    expect(f.domain).toBe('rule')
    expect(f.type).toBe('rule-violation')
    expect(f.detectorId).toBe('rules-engine')
    expect(f.severity).toBe('high')
    expect(f.status).toBe('open')
    expect(f.title).toContain('payments-locked')
    expect(f.summary).toContain('subsystem:orders')
    expect(f.summary).toContain('subsystem:payments')
    expect(f.involvedNodeIds).toEqual(['subsystem:orders', 'subsystem:payments'])
    expect(f.metadata).toMatchObject({ ruleId: 'payments-locked', mode: 'enforce' })
  })

  it('non-empty allowedFrom — only disallowed subsystems trigger findings', () => {
    // Only orders is allowed to access payments; api is not
    const rule: BoundaryRule = {
      kind: 'boundary',
      id: 'payments-guarded',
      title: 'Only orders may access payments',
      severity: 'medium',
      mode: 'advisory',
      protectedSubsystem: 'payments',
      allowedFrom: ['orders'],
      description: '',
    }

    const nodes = [
      makeSubsystemNode('subsystem:payments'),
      makeSubsystemNode('subsystem:orders'),
      makeSubsystemNode('subsystem:api'),
    ]
    const edges = [
      makeEdge('subsystem:orders', 'subsystem:payments'), // allowed
      makeEdge('subsystem:api', 'subsystem:payments'), // not allowed
    ]
    const snapshot = makeSnapshot(nodes, edges)

    const findings = evaluateBoundary(rule, { snapshot, baseline: null })

    expect(findings).toHaveLength(1)
    expect(findings[0]?.id).toBe('rule:payments-guarded:subsystem:api->subsystem:payments')
    expect(findings[0]?.involvedNodeIds).toEqual(['subsystem:api', 'subsystem:payments'])
    expect(findings[0]?.metadata).toMatchObject({ ruleId: 'payments-guarded', mode: 'advisory' })
  })

  it('no edges to protected subsystem → no findings', () => {
    const rule: BoundaryRule = {
      kind: 'boundary',
      id: 'payments-guarded',
      title: 'Only orders may access payments',
      severity: 'medium',
      mode: 'advisory',
      protectedSubsystem: 'payments',
      allowedFrom: [],
      description: '',
    }

    const nodes = [makeSubsystemNode('subsystem:payments'), makeSubsystemNode('subsystem:api')]
    const edges: Edge[] = [] // nothing points to payments
    const snapshot = makeSnapshot(nodes, edges)

    const findings = evaluateBoundary(rule, { snapshot, baseline: null })

    expect(findings).toHaveLength(0)
  })

  it('does not flag a boundary violation for a purely type-only edge', () => {
    function makeTypeOnlyEdge(from: string, to: string, kind: Edge['kind'] = 'depends_on'): Edge {
      return { ...makeEdge(from, to, kind), typeOnlyWeight: 1, runtimeWeight: 0, dynamicWeight: 0 }
    }

    const rule: BoundaryRule = {
      kind: 'boundary',
      id: 'b1',
      title: 't',
      severity: 'medium',
      mode: 'advisory',
      protectedSubsystem: 'core',
      allowedFrom: [],
      description: '',
    }

    const nodes = [makeSubsystemNode('subsystem:core'), makeSubsystemNode('subsystem:ui')]
    const edges = [makeTypeOnlyEdge('subsystem:ui', 'subsystem:core')]
    const snapshot = makeSnapshot(nodes, edges)

    const findings = evaluateBoundary(rule, { snapshot, baseline: null })

    expect(findings).toHaveLength(0)
  })

  it('non-subsystem from-edges are skipped', () => {
    // A file edge pointing to payments should not trigger the boundary rule
    const rule: BoundaryRule = {
      kind: 'boundary',
      id: 'payments-locked',
      title: 'Payments fully locked',
      severity: 'high',
      mode: 'enforce',
      protectedSubsystem: 'payments',
      allowedFrom: [],
      description: '',
    }

    const nodes = [
      makeSubsystemNode('subsystem:payments'),
      {
        id: 'file:src/payments/index.ts',
        kind: 'file' as const,
        title: 'index.ts',
        layer: 'unknown' as const,
        status: 'unknown' as const,
        tags: [],
        files: [],
        metadata: {},
      },
    ]
    const edges = [
      // from a file node (not a subsystem) — should be skipped
      makeEdge('file:src/payments/index.ts', 'subsystem:payments'),
    ]
    const snapshot = makeSnapshot(nodes, edges)

    const findings = evaluateBoundary(rule, { snapshot, baseline: null })

    // File-level from edges are skipped; only subsystem-to-subsystem edges matter
    expect(findings).toHaveLength(0)
  })
})
