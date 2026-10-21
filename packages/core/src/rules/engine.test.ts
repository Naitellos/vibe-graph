import { describe, expect, it } from 'vitest'
import type { Edge } from '../schema/edge.js'
import type { Node } from '../schema/node.js'
import type { Rule } from '../schema/rule.js'
import type { Snapshot } from '../schema/snapshot.js'
import { buildLoadedSnapshot } from '../snapshot/load-snapshot.js'
import { evaluateRules } from './engine.js'

// ── Test helpers ──────────────────────────────────────────────────────────────

function makeSubsystemNode(id: string, layer: Node['layer'] = 'unknown'): Node {
  return {
    id,
    kind: 'subsystem',
    title: id.replace(/^subsystem:/, ''),
    layer,
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

describe('evaluateRules (engine dispatcher)', () => {
  it('dispatches edge-pattern rule and returns its findings', () => {
    const rule: Rule = {
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

    const nodes = [
      makeSubsystemNode('subsystem:db', 'infra'),
      makeSubsystemNode('subsystem:orders', 'domain'),
    ]
    const edges = [makeEdge('subsystem:db', 'subsystem:orders', 'imports')]
    const snapshot = makeSnapshot(nodes, edges)

    const findings = evaluateRules({ snapshot, baseline: null, rules: [rule] })

    expect(findings).toHaveLength(1)
    expect(findings[0]?.id).toBe('rule:no-infra-to-domain:subsystem:db->subsystem:orders')
  })

  it('dispatches boundary rule and returns its findings', () => {
    const rule: Rule = {
      kind: 'boundary',
      id: 'payments-locked',
      title: 'Payments locked',
      severity: 'high',
      mode: 'enforce',
      protectedSubsystem: 'payments',
      allowedFrom: [],
      description: '',
    }

    const nodes = [makeSubsystemNode('subsystem:payments'), makeSubsystemNode('subsystem:api')]
    const edges = [makeEdge('subsystem:api', 'subsystem:payments')]
    const snapshot = makeSnapshot(nodes, edges)

    const findings = evaluateRules({ snapshot, baseline: null, rules: [rule] })

    expect(findings).toHaveLength(1)
    expect(findings[0]?.id).toBe('rule:payments-locked:subsystem:api->subsystem:payments')
  })

  it('dispatches builtin no_cycles rule (baseline null → no-op)', () => {
    const rule: Rule = {
      kind: 'builtin',
      id: 'no-new-cycles',
      title: 'No new cycles',
      severity: 'high',
      mode: 'enforce',
      check: 'no_cycles',
    }

    const nodes = [makeSubsystemNode('subsystem:a'), makeSubsystemNode('subsystem:b')]
    const edges = [makeEdge('subsystem:a', 'subsystem:b'), makeEdge('subsystem:b', 'subsystem:a')]
    const snapshot = makeSnapshot(nodes, edges)

    // no baseline → no-op for builtin rules
    const findings = evaluateRules({ snapshot, baseline: null, rules: [rule] })

    expect(findings).toHaveLength(0)
  })

  it('dispatches multiple rules of different kinds and aggregates findings', () => {
    const edgePatternRule: Rule = {
      kind: 'edge-pattern',
      id: 'no-infra-imports',
      title: 'No infra imports domain',
      severity: 'high',
      mode: 'enforce',
      from: { layer: 'infra' },
      to: { layer: 'domain' },
      relation: 'imports',
      forbidden: true,
      description: '',
    }
    const boundaryRule: Rule = {
      kind: 'boundary',
      id: 'payments-guarded',
      title: 'Payments guarded',
      severity: 'medium',
      mode: 'advisory',
      protectedSubsystem: 'payments',
      allowedFrom: [],
      description: '',
    }

    const nodes = [
      makeSubsystemNode('subsystem:db', 'infra'),
      makeSubsystemNode('subsystem:orders', 'domain'),
      makeSubsystemNode('subsystem:payments', 'domain'),
    ]
    const edges = [
      makeEdge('subsystem:db', 'subsystem:orders', 'imports'), // edge-pattern violation
      makeEdge('subsystem:orders', 'subsystem:payments'), // boundary violation
    ]
    const snapshot = makeSnapshot(nodes, edges)

    const findings = evaluateRules({
      snapshot,
      baseline: null,
      rules: [edgePatternRule, boundaryRule],
    })

    expect(findings).toHaveLength(2)
    const ids = findings.map((f) => f.id).sort()
    expect(ids).toContain('rule:no-infra-imports:subsystem:db->subsystem:orders')
    expect(ids).toContain('rule:payments-guarded:subsystem:orders->subsystem:payments')
  })

  it('empty rules array → no findings', () => {
    const nodes = [makeSubsystemNode('subsystem:a'), makeSubsystemNode('subsystem:b')]
    const edges = [makeEdge('subsystem:a', 'subsystem:b')]
    const snapshot = makeSnapshot(nodes, edges)

    const findings = evaluateRules({ snapshot, baseline: null, rules: [] })

    expect(findings).toHaveLength(0)
  })
})
