import { describe, expect, it } from 'vitest'
import type { Edge } from '../schema/edge.js'
import type { Node } from '../schema/node.js'
import type { Snapshot } from '../schema/snapshot.js'
import { buildLoadedSnapshot } from '../snapshot/load-snapshot.js'
import { noLayerViolationPreset } from './builtin/no-layer-violation.js'
import type { EdgePatternRule } from './edge-pattern.js'
import { evaluateEdgePattern } from './edge-pattern.js'

// ── Test helpers ──────────────────────────────────────────────────────────────

function makeNode(
  id: string,
  layer: Node['layer'] = 'unknown',
  kind: Node['kind'] = 'subsystem',
): Node {
  return {
    id,
    kind,
    title: id.replace(/^subsystem:/, '').replace(/^file:/, ''),
    layer,
    status: 'unknown',
    tags: [],
    files: [],
    metadata: {},
  }
}

function makeEdge(
  from: string,
  to: string,
  kind: Edge['kind'] = 'depends_on',
  evidenceIds: string[] = [],
): Edge {
  return {
    id: `edge:${from}:${to}:${kind}`,
    from,
    to,
    kind,
    category: 'structural',
    source: 'manual',
    confidence: 'high',
    evidenceIds,
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

describe('evaluateEdgePattern', () => {
  it('layer matcher — forbidden edge exists → 1 finding', () => {
    // infra → domain is forbidden
    const rule: EdgePatternRule = {
      kind: 'edge-pattern',
      id: 'no-infra-to-domain',
      title: 'No infra→domain imports',
      severity: 'high',
      mode: 'enforce',
      from: { layer: 'infra' },
      to: { layer: 'domain' },
      relation: 'imports',
      forbidden: true,
      description: '',
    }

    const nodes = [
      makeNode('subsystem:db', 'infra'),
      makeNode('subsystem:orders', 'domain'),
      makeNode('subsystem:api', 'horizontal'),
    ]
    const edges = [
      makeEdge('subsystem:db', 'subsystem:orders', 'imports'),
      makeEdge('subsystem:api', 'subsystem:orders', 'imports'),
    ]
    const snapshot = makeSnapshot(nodes, edges)

    const findings = evaluateEdgePattern(rule, { snapshot, baseline: null })

    expect(findings).toHaveLength(1)
    const f = findings[0]
    if (!f) throw new Error('expected one finding')
    expect(f.id).toBe('rule:no-infra-to-domain:subsystem:db->subsystem:orders')
    expect(f.domain).toBe('rule')
    expect(f.type).toBe('rule-violation')
    expect(f.detectorId).toBe('rules-engine')
    expect(f.severity).toBe('high')
    expect(f.status).toBe('open')
    expect(f.title).toContain('no-infra-to-domain')
    expect(f.title).toContain('→')
    expect(f.summary).toContain('subsystem:db')
    expect(f.summary).toContain('subsystem:orders')
    expect(f.involvedNodeIds).toEqual(['subsystem:db', 'subsystem:orders'])
    expect(f.metadata).toMatchObject({ ruleId: 'no-infra-to-domain', mode: 'enforce' })
  })

  it('layer matcher — no matching edge → no findings', () => {
    // No infra→domain imports in the snapshot
    const rule: EdgePatternRule = {
      kind: 'edge-pattern',
      id: 'no-infra-to-domain',
      title: 'No infra→domain imports',
      severity: 'high',
      mode: 'enforce',
      from: { layer: 'infra' },
      to: { layer: 'domain' },
      relation: 'imports',
      forbidden: true,
      description: '',
    }

    const nodes = [makeNode('subsystem:db', 'infra'), makeNode('subsystem:orders', 'domain')]
    const edges = [
      // only domain→infra edge — legal direction
      makeEdge('subsystem:orders', 'subsystem:db', 'imports'),
    ]
    const snapshot = makeSnapshot(nodes, edges)

    const findings = evaluateEdgePattern(rule, { snapshot, baseline: null })

    expect(findings).toHaveLength(0)
  })

  it('subsystem matcher — forbidden edge from specific subsystem → 1 finding', () => {
    const rule: EdgePatternRule = {
      kind: 'edge-pattern',
      id: 'no-payment-to-orders',
      title: 'Payment must not depend on orders',
      severity: 'medium',
      mode: 'advisory',
      from: { subsystem: 'payment' },
      to: { subsystem: 'orders' },
      relation: 'depends_on',
      forbidden: true,
      description: '',
    }

    const nodes = [makeNode('subsystem:payment', 'domain'), makeNode('subsystem:orders', 'domain')]
    const edges = [makeEdge('subsystem:payment', 'subsystem:orders', 'depends_on')]
    const snapshot = makeSnapshot(nodes, edges)

    const findings = evaluateEdgePattern(rule, { snapshot, baseline: null })

    expect(findings).toHaveLength(1)
    expect(findings[0]?.id).toBe('rule:no-payment-to-orders:subsystem:payment->subsystem:orders')
    expect(findings[0]?.metadata).toMatchObject({
      ruleId: 'no-payment-to-orders',
      mode: 'advisory',
    })
  })

  it('exclude_subsystem matcher — excludes the specified subsystem from matching', () => {
    // All non-auth infra nodes may not import domain nodes, but auth is excluded
    const rule: EdgePatternRule = {
      kind: 'edge-pattern',
      id: 'no-infra-to-domain-except-auth',
      title: 'Infra (excl. auth) must not import domain',
      severity: 'medium',
      mode: 'advisory',
      from: { layer: 'infra', exclude_subsystem: 'auth' },
      to: { layer: 'domain' },
      relation: 'imports',
      forbidden: true,
      description: '',
    }

    const nodes = [
      makeNode('subsystem:db', 'infra'),
      makeNode('subsystem:auth', 'infra'),
      makeNode('subsystem:orders', 'domain'),
    ]
    const edges = [
      // db→orders: infra, not auth → should match forbidden pattern
      makeEdge('subsystem:db', 'subsystem:orders', 'imports'),
      // auth→orders: infra but excluded → should NOT match
      makeEdge('subsystem:auth', 'subsystem:orders', 'imports'),
    ]
    const snapshot = makeSnapshot(nodes, edges)

    const findings = evaluateEdgePattern(rule, { snapshot, baseline: null })

    expect(findings).toHaveLength(1)
    expect(findings[0]?.id).toBe(
      'rule:no-infra-to-domain-except-auth:subsystem:db->subsystem:orders',
    )
  })

  it('relation filter — only matches edges with the specified relation kind', () => {
    // Forbidden: infra imports domain — but depends_on edges should not trigger
    const rule: EdgePatternRule = {
      kind: 'edge-pattern',
      id: 'no-infra-imports-domain',
      title: 'No infra imports domain',
      severity: 'low',
      mode: 'advisory',
      from: { layer: 'infra' },
      to: { layer: 'domain' },
      relation: 'imports',
      forbidden: true,
      description: '',
    }

    const nodes = [makeNode('subsystem:db', 'infra'), makeNode('subsystem:orders', 'domain')]
    const edges = [
      // same nodes but different edge kind — should NOT trigger
      makeEdge('subsystem:db', 'subsystem:orders', 'depends_on'),
    ]
    const snapshot = makeSnapshot(nodes, edges)

    const findings = evaluateEdgePattern(rule, { snapshot, baseline: null })

    expect(findings).toHaveLength(0)
  })

  it('forbidden: false → returns [] (v1.x placeholder)', () => {
    // TODO(v1.x): emit Finding when required edge is missing
    const rule: EdgePatternRule = {
      kind: 'edge-pattern',
      id: 'require-api-to-orders',
      title: 'api must depend on orders',
      severity: 'medium',
      mode: 'advisory',
      from: { layer: 'horizontal' },
      to: { layer: 'domain' },
      relation: 'depends_on',
      forbidden: false,
      description: '',
    }

    const nodes = [makeNode('subsystem:api', 'horizontal'), makeNode('subsystem:orders', 'domain')]
    const edges: Edge[] = [] // no edges at all
    const snapshot = makeSnapshot(nodes, edges)

    const findings = evaluateEdgePattern(rule, { snapshot, baseline: null })

    expect(findings).toHaveLength(0)
  })

  it('evidenceIds are propagated from the edge to the finding', () => {
    const rule: EdgePatternRule = {
      kind: 'edge-pattern',
      id: 'no-infra-to-domain',
      title: 'No infra→domain',
      severity: 'high',
      mode: 'enforce',
      from: { layer: 'infra' },
      to: { layer: 'domain' },
      relation: 'imports',
      forbidden: true,
      description: '',
    }

    const nodes = [makeNode('subsystem:db', 'infra'), makeNode('subsystem:orders', 'domain')]
    const edges = [makeEdge('subsystem:db', 'subsystem:orders', 'imports', ['ev:1', 'ev:2'])]
    const snapshot = makeSnapshot(nodes, edges)

    const findings = evaluateEdgePattern(rule, { snapshot, baseline: null })

    expect(findings).toHaveLength(1)
    expect(findings[0]?.evidenceIds).toEqual(['ev:1', 'ev:2'])
  })

  // Regression — PR #12 review: user edge-pattern rule with relation:'imports' and
  // layer/subsystem matchers used to silently miss real scan output because the AST
  // analyzer emits imports as file:* → file:* edges and file nodes carry layer:'unknown'.
  // Fix: isNodeMatched now resolves file endpoints to their owning subsystem via
  // contains edges, so layer/subsystem matchers fire on the owner's attributes.
  it('layer matcher with relation:imports — file endpoints resolve to owning subsystem', () => {
    const rule: EdgePatternRule = {
      kind: 'edge-pattern',
      id: 'no-domain-imports-horizontal',
      title: 'Domain files must not import horizontal files',
      severity: 'high',
      mode: 'warn',
      from: { layer: 'domain' },
      to: { layer: 'horizontal' },
      relation: 'imports',
      forbidden: true,
      description: '',
    }

    const nodes = [
      makeNode('subsystem:domain', 'domain', 'subsystem'),
      makeNode('subsystem:ui', 'horizontal', 'subsystem'),
      // File nodes carry layer:'unknown' as core-files.ts emits them
      makeNode('file:src/domain/foo.ts', 'unknown', 'file'),
      makeNode('file:src/ui/bar.ts', 'unknown', 'file'),
    ]
    const edges = [
      // contains edges (subsystem owns file) — Plan 2 yaml-edges analyzer pattern
      makeEdge('subsystem:domain', 'file:src/domain/foo.ts', 'contains'),
      makeEdge('subsystem:ui', 'file:src/ui/bar.ts', 'contains'),
      // import edge as core-ts-imports.ts emits it: file → file
      makeEdge('file:src/domain/foo.ts', 'file:src/ui/bar.ts', 'imports'),
    ]
    const snapshot = makeSnapshot(nodes, edges)

    const findings = evaluateEdgePattern(rule, { snapshot, baseline: null })

    // Without the fix this would be 0 (file.layer='unknown' never matches 'domain').
    expect(findings).toHaveLength(1)
    expect(findings[0]?.id).toBe(
      'rule:no-domain-imports-horizontal:file:src/domain/foo.ts->file:src/ui/bar.ts',
    )
    expect(findings[0]?.involvedNodeIds).toEqual(['file:src/domain/foo.ts', 'file:src/ui/bar.ts'])
  })

  it('subsystem matcher with relation:imports — file endpoint resolves to owning subsystem', () => {
    const rule: EdgePatternRule = {
      kind: 'edge-pattern',
      id: 'no-payment-imports-orders',
      title: 'payment must not import orders',
      severity: 'medium',
      mode: 'advisory',
      from: { subsystem: 'payment' },
      to: { subsystem: 'orders' },
      relation: 'imports',
      forbidden: true,
      description: '',
    }

    const nodes = [
      makeNode('subsystem:payment', 'domain', 'subsystem'),
      makeNode('subsystem:orders', 'domain', 'subsystem'),
      makeNode('file:src/payment/charge.ts', 'unknown', 'file'),
      makeNode('file:src/orders/list.ts', 'unknown', 'file'),
    ]
    const edges = [
      makeEdge('subsystem:payment', 'file:src/payment/charge.ts', 'contains'),
      makeEdge('subsystem:orders', 'file:src/orders/list.ts', 'contains'),
      makeEdge('file:src/payment/charge.ts', 'file:src/orders/list.ts', 'imports'),
    ]
    const snapshot = makeSnapshot(nodes, edges)

    const findings = evaluateEdgePattern(rule, { snapshot, baseline: null })

    expect(findings).toHaveLength(1)
  })

  // ── Type-only edge helpers ────────────────────────────────────────────────

  function makeTypeOnlyEdge(from: string, to: string, kind: Edge['kind'] = 'depends_on'): Edge {
    return { ...makeEdge(from, to, kind), typeOnlyWeight: 1, runtimeWeight: 0, dynamicWeight: 0 }
  }

  it('layer matcher with relation:imports — unowned file does NOT fire (no determinate layer)', () => {
    const rule: EdgePatternRule = {
      kind: 'edge-pattern',
      id: 'no-domain-imports-horizontal',
      title: 'no-domain-imports-horizontal',
      severity: 'low',
      mode: 'advisory',
      from: { layer: 'domain' },
      to: { layer: 'horizontal' },
      relation: 'imports',
      forbidden: true,
      description: '',
    }

    const nodes = [
      makeNode('subsystem:ui', 'horizontal', 'subsystem'),
      // foo.ts is NOT owned by any subsystem (no contains edge into it)
      makeNode('file:src/foo.ts', 'unknown', 'file'),
      makeNode('file:src/ui/bar.ts', 'unknown', 'file'),
    ]
    const edges = [
      makeEdge('subsystem:ui', 'file:src/ui/bar.ts', 'contains'),
      makeEdge('file:src/foo.ts', 'file:src/ui/bar.ts', 'imports'),
    ]
    const snapshot = makeSnapshot(nodes, edges)

    const findings = evaluateEdgePattern(rule, { snapshot, baseline: null })

    // Unowned 'from' file has no determinate layer → doesn't satisfy from.layer='domain'
    expect(findings).toHaveLength(0)
  })

  // ── Task 6: type-only edge skip + conservative unknown-layer tests ─────────

  it('does not fire on a purely type-only domain→horizontal edge', () => {
    const d = { ...makeNode('subsystem:d', 'domain'), layer: 'domain' as const }
    const h = { ...makeNode('subsystem:h', 'horizontal'), layer: 'horizontal' as const }
    const findings = evaluateEdgePattern(
      noLayerViolationPreset as never,
      { snapshot: makeSnapshot([d, h], [makeTypeOnlyEdge('subsystem:d', 'subsystem:h')]) } as never,
    )
    expect(findings).toHaveLength(0)
  })

  it('still fires on a runtime domain→horizontal edge', () => {
    const d = { ...makeNode('subsystem:d', 'domain'), layer: 'domain' as const }
    const h = { ...makeNode('subsystem:h', 'horizontal'), layer: 'horizontal' as const }
    const runtime = { ...makeEdge('subsystem:d', 'subsystem:h', 'depends_on'), runtimeWeight: 1 }
    const findings = evaluateEdgePattern(
      noLayerViolationPreset as never,
      { snapshot: makeSnapshot([d, h], [runtime]) } as never,
    )
    expect(findings).toHaveLength(1)
  })

  it('never fires when an endpoint layer is unknown (conservative)', () => {
    const d = { ...makeNode('subsystem:d', 'domain'), layer: 'domain' as const }
    const u = { ...makeNode('subsystem:u', 'unknown'), layer: 'unknown' as const }
    const runtime = { ...makeEdge('subsystem:d', 'subsystem:u', 'depends_on'), runtimeWeight: 1 }
    const findings = evaluateEdgePattern(
      noLayerViolationPreset as never,
      { snapshot: makeSnapshot([d, u], [runtime]) } as never,
    )
    expect(findings).toHaveLength(0)
  })
})
