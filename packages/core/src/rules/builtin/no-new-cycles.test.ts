import { describe, expect, it } from 'vitest'
import type { Edge } from '../../schema/edge.js'
import type { GraphBaseline } from '../../schema/graph-baseline.js'
import type { Node } from '../../schema/node.js'
import type { Snapshot } from '../../schema/snapshot.js'
import { buildLoadedSnapshot } from '../../snapshot/load-snapshot.js'
import { evaluateNoNewCycles } from './no-new-cycles.js'
import type { BuiltinRule } from './no-new-cycles.js'

// ── Test helpers ──────────────────────────────────────────────────────────────

function makeNode(id: string, kind: Node['kind'] = 'subsystem'): Node {
  return {
    id,
    kind,
    title: id,
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

function makeBaseline(nodes: Node[], edges: Edge[]): GraphBaseline {
  return {
    schemaVersion: '1.0',
    snapshotId: 'baseline-snap',
    createdAt: new Date().toISOString(),
    fingerprint: 'fp-test',
    nodes,
    edges,
    findings: [],
  }
}

const testRule: BuiltinRule = {
  kind: 'builtin',
  id: 'no-new-cycles',
  severity: 'high',
  mode: 'advisory',
  check: 'no_cycles',
  title: 'No new cycles',
  description: '',
}

// ── Tests ─────────────────────────────────────────────────────────────────────

describe('evaluateNoNewCycles', () => {
  it('no baseline → no findings (rule is no-op on first scan)', () => {
    // Even if working snapshot has a cycle, no baseline means no findings
    const nodes = [makeNode('subsystem:a'), makeNode('subsystem:b'), makeNode('subsystem:c')]
    const edges = [
      makeEdge('subsystem:a', 'subsystem:b'),
      makeEdge('subsystem:b', 'subsystem:c'),
      makeEdge('subsystem:c', 'subsystem:a'),
    ]
    const snapshot = makeSnapshot(nodes, edges)

    const findings = evaluateNoNewCycles(testRule, { snapshot, baseline: null })

    expect(findings).toHaveLength(0)
  })

  it('baseline has same cycle → no findings', () => {
    // The cycle already existed in baseline, so it is not "new"
    const nodes = [makeNode('subsystem:a'), makeNode('subsystem:b'), makeNode('subsystem:c')]
    const edges = [
      makeEdge('subsystem:a', 'subsystem:b'),
      makeEdge('subsystem:b', 'subsystem:c'),
      makeEdge('subsystem:c', 'subsystem:a'),
    ]
    const snapshot = makeSnapshot(nodes, edges)
    const baseline = makeBaseline(nodes, edges)

    const findings = evaluateNoNewCycles(testRule, { snapshot, baseline })

    expect(findings).toHaveLength(0)
  })

  it('working has new cycle not in baseline → 1 finding with correct shape', () => {
    // Baseline: a→b→c (DAG, no cycle)
    // Working: a→b→c→a (cycle!)
    const baselineNodes = [
      makeNode('subsystem:a'),
      makeNode('subsystem:b'),
      makeNode('subsystem:c'),
    ]
    const baselineEdges = [
      makeEdge('subsystem:a', 'subsystem:b'),
      makeEdge('subsystem:b', 'subsystem:c'),
    ]

    const workingNodes = [makeNode('subsystem:a'), makeNode('subsystem:b'), makeNode('subsystem:c')]
    const workingEdges = [
      makeEdge('subsystem:a', 'subsystem:b'),
      makeEdge('subsystem:b', 'subsystem:c'),
      makeEdge('subsystem:c', 'subsystem:a'),
    ]

    const snapshot = makeSnapshot(workingNodes, workingEdges)
    const baseline = makeBaseline(baselineNodes, baselineEdges)

    const findings = evaluateNoNewCycles(testRule, { snapshot, baseline })

    expect(findings).toHaveLength(1)

    const f = findings[0]
    if (f === undefined) throw new Error('expected one finding')
    // id encodes rule id + cycle hash
    expect(f.id).toMatch(/^rule:no-new-cycles:/)
    expect(f.domain).toBe('rule')
    expect(f.type).toBe('rule-violation')
    expect(f.detectorId).toBe('rules-engine')
    expect(f.severity).toBe('high')
    expect(f.status).toBe('open')
    expect(f.title).toContain('New cycle')
    expect(f.title).toContain('no-new-cycles')
    expect(f.involvedNodeIds.slice().sort()).toEqual(['subsystem:a', 'subsystem:b', 'subsystem:c'])
    expect(f.evidenceIds).toEqual([])
    expect(f.metadata).toMatchObject({ ruleId: 'no-new-cycles', mode: 'advisory' })
  })
})
