import assert from 'node:assert'
import { describe, expect, it } from 'vitest'
import type { Edge } from '../schema/edge.js'
import type { Evidence } from '../schema/evidence.js'
import type { Node } from '../schema/node.js'
import { type AnalyzerOutput, ScanError, mergeAnalyzerOutputs } from './merge.js'

// ─── Helpers ─────────────────────────────────────────────────────────────────

function makeNode(overrides: Partial<Node> & Pick<Node, 'id' | 'kind' | 'title'>): Node {
  return {
    layer: 'unknown',
    status: 'unknown',
    tags: [],
    files: [],
    metadata: {},
    ...overrides,
  }
}

function makeEdge(
  overrides: Partial<Edge> & Pick<Edge, 'id' | 'from' | 'to' | 'kind' | 'source' | 'confidence'>,
): Edge {
  return {
    category: 'structural',
    evidenceIds: [],
    weight: 1,
    runtimeWeight: 0,
    typeOnlyWeight: 0,
    dynamicWeight: 0,
    metadata: {},
    ...overrides,
  }
}

function makeEvidence(id: string): Evidence {
  return {
    id,
    sourceKind: 'ast',
    file: 'some/file.ts',
    detail: 'test evidence',
    confidence: 'high',
    coupling: 'runtime',
  }
}

function makeOutput(
  analyzerId: string,
  nodes: Node[],
  edges: Edge[],
  evidence: Evidence[] = [],
): AnalyzerOutput {
  return { analyzerId, nodes, edges, evidence }
}

// ─── Tests ────────────────────────────────────────────────────────────────────

describe('mergeAnalyzerOutputs', () => {
  // Test 9: Empty input (degenerate case, listed first for clarity)
  it('Test 9 — empty input returns empty result', () => {
    const result = mergeAnalyzerOutputs([])
    expect(result.nodes).toEqual([])
    expect(result.edges).toEqual([])
    expect(result.evidence).toEqual([])
  })

  // ─── Node merge ──────────────────────────────────────────────────────────

  it('Test 1 — node merge: same id + same kind → union tags/files, first-wins title', () => {
    const nodeA = makeNode({
      id: 'subsystem:auth',
      kind: 'subsystem',
      title: 'Auth',
      tags: ['a', 'b'],
      files: ['x.ts'],
    })
    const nodeB = makeNode({
      id: 'subsystem:auth',
      kind: 'subsystem',
      title: 'Auth-DIFFERENT',
      tags: ['b', 'c'],
      files: ['y.ts'],
    })

    const result = mergeAnalyzerOutputs([
      makeOutput('analyzer-a', [nodeA], []),
      makeOutput('analyzer-b', [nodeB], []),
    ])

    expect(result.nodes).toHaveLength(1)
    const merged = result.nodes[0]
    assert(merged !== undefined)
    expect(merged.title).toBe('Auth') // first-wins
    expect(merged.tags).toEqual(['a', 'b', 'c']) // union
    expect(merged.files).toEqual(['x.ts', 'y.ts']) // union
  })

  it('Test 2 — node kind conflict → throws ScanError NODE_KIND_CONFLICT', () => {
    const nodeA = makeNode({ id: 'foo', kind: 'subsystem', title: 'F' })
    const nodeB = makeNode({ id: 'foo', kind: 'file', title: 'F' })

    expect(() =>
      mergeAnalyzerOutputs([
        makeOutput('analyzer-a', [nodeA], []),
        makeOutput('analyzer-b', [nodeB], []),
      ]),
    ).toThrow(ScanError)

    try {
      mergeAnalyzerOutputs([
        makeOutput('analyzer-a', [nodeA], []),
        makeOutput('analyzer-b', [nodeB], []),
      ])
    } catch (err) {
      expect(err).toBeInstanceOf(ScanError)
      const scanErr = err as ScanError
      expect(scanErr.code).toBe('NODE_KIND_CONFLICT')
      expect(scanErr.details.nodeId).toBe('foo')
      expect(scanErr.details.analyzerIds).toContain('analyzer-a')
      expect(scanErr.details.analyzerIds).toContain('analyzer-b')
      const kinds = scanErr.details.kinds as string[]
      expect(kinds).toContain('subsystem')
      expect(kinds).toContain('file')
    }
  })

  // ─── Edge merge ──────────────────────────────────────────────────────────

  it('Test 3 — edge weight summation and evidenceIds union', () => {
    const edgeA = makeEdge({
      id: 'edge-1',
      from: 'file:a',
      to: 'file:b',
      kind: 'imports',
      source: 'ast',
      confidence: 'high',
      weight: 1,
      runtimeWeight: 1,
      typeOnlyWeight: 0,
      dynamicWeight: 0,
      evidenceIds: ['ev1'],
    })
    const edgeB = makeEdge({
      id: 'edge-2',
      from: 'file:a',
      to: 'file:b',
      kind: 'imports',
      source: 'ast',
      confidence: 'high',
      weight: 2,
      runtimeWeight: 2,
      typeOnlyWeight: 1,
      dynamicWeight: 0,
      evidenceIds: ['ev2', 'ev3'],
    })

    const result = mergeAnalyzerOutputs([
      makeOutput('analyzer-a', [], [edgeA]),
      makeOutput('analyzer-b', [], [edgeB]),
    ])

    expect(result.edges).toHaveLength(1)
    const merged = result.edges[0]
    assert(merged !== undefined)
    expect(merged.weight).toBe(3)
    expect(merged.runtimeWeight).toBe(3)
    expect(merged.typeOnlyWeight).toBe(1)
    expect(merged.dynamicWeight).toBe(0)
    expect(merged.evidenceIds).toEqual(['ev1', 'ev2', 'ev3'])
  })

  it('Test 4 — ast vs manual edges stay separate (different source → different key)', () => {
    const edgeAst = makeEdge({
      id: 'edge-ast',
      from: 'file:a',
      to: 'file:b',
      kind: 'imports',
      source: 'ast',
      confidence: 'high',
    })
    const edgeManual = makeEdge({
      id: 'edge-manual',
      from: 'file:a',
      to: 'file:b',
      kind: 'imports',
      source: 'manual',
      confidence: 'high',
    })

    const result = mergeAnalyzerOutputs([
      makeOutput('analyzer-a', [], [edgeAst]),
      makeOutput('analyzer-b', [], [edgeManual]),
    ])

    expect(result.edges).toHaveLength(2)
    const sources = result.edges.map((e) => e.source).sort()
    expect(sources).toEqual(['ast', 'manual'])
  })

  it('Test 5 — edge category: structural is default/"no opinion", explicit wins', () => {
    // Edge 1: category=structural (default), Edge 2: category=domain → result should be domain
    const edgeStructural = makeEdge({
      id: 'edge-1',
      from: 'file:a',
      to: 'file:b',
      kind: 'imports',
      source: 'ast',
      confidence: 'high',
      category: 'structural',
    })
    const edgeDomain = makeEdge({
      id: 'edge-2',
      from: 'file:a',
      to: 'file:b',
      kind: 'imports',
      source: 'ast',
      confidence: 'high',
      category: 'domain',
    })

    const result = mergeAnalyzerOutputs([
      makeOutput('analyzer-a', [], [edgeStructural]),
      makeOutput('analyzer-b', [], [edgeDomain]),
    ])

    expect(result.edges).toHaveLength(1)
    const edge5 = result.edges[0]
    assert(edge5 !== undefined)
    expect(edge5.category).toBe('domain')
  })

  it('Test 6 — edge category conflict → throws ScanError EDGE_CATEGORY_CONFLICT', () => {
    const edgeDomain = makeEdge({
      id: 'edge-1',
      from: 'file:a',
      to: 'file:b',
      kind: 'imports',
      source: 'ast',
      confidence: 'high',
      category: 'domain',
    })
    const edgeInfra = makeEdge({
      id: 'edge-2',
      from: 'file:a',
      to: 'file:b',
      kind: 'imports',
      source: 'ast',
      confidence: 'high',
      category: 'infra',
    })

    expect(() =>
      mergeAnalyzerOutputs([
        makeOutput('analyzer-a', [], [edgeDomain]),
        makeOutput('analyzer-b', [], [edgeInfra]),
      ]),
    ).toThrow(ScanError)

    try {
      mergeAnalyzerOutputs([
        makeOutput('analyzer-a', [], [edgeDomain]),
        makeOutput('analyzer-b', [], [edgeInfra]),
      ])
    } catch (err) {
      expect(err).toBeInstanceOf(ScanError)
      const scanErr = err as ScanError
      expect(scanErr.code).toBe('EDGE_CATEGORY_CONFLICT')
    }
  })

  it('Test 7 — confidence worst-wins: high+low → low', () => {
    const edgeHigh = makeEdge({
      id: 'edge-1',
      from: 'file:a',
      to: 'file:b',
      kind: 'imports',
      source: 'ast',
      confidence: 'high',
    })
    const edgeLow = makeEdge({
      id: 'edge-2',
      from: 'file:a',
      to: 'file:b',
      kind: 'imports',
      source: 'ast',
      confidence: 'low',
    })

    const result = mergeAnalyzerOutputs([
      makeOutput('analyzer-a', [], [edgeHigh]),
      makeOutput('analyzer-b', [], [edgeLow]),
    ])

    expect(result.edges).toHaveLength(1)
    const edge7 = result.edges[0]
    assert(edge7 !== undefined)
    expect(edge7.confidence).toBe('low')
  })

  it('Test 8 — evidence pass-through: all evidence ids concat', () => {
    const ev1 = makeEvidence('ev-1')
    const ev2 = makeEvidence('ev-2')
    const ev3 = makeEvidence('ev-3')

    const result = mergeAnalyzerOutputs([
      makeOutput('analyzer-a', [], [], [ev1, ev2]),
      makeOutput('analyzer-b', [], [], [ev3]),
    ])

    expect(result.evidence).toHaveLength(3)
    const ids = result.evidence.map((e) => e.id)
    expect(ids).toContain('ev-1')
    expect(ids).toContain('ev-2')
    expect(ids).toContain('ev-3')
  })

  // ─── Additional edge cases ───────────────────────────────────────────────

  it('layer first-wins with unknown preference: prefer non-unknown', () => {
    const nodeA = makeNode({ id: 'subsystem:x', kind: 'subsystem', title: 'X', layer: 'unknown' })
    const nodeB = makeNode({ id: 'subsystem:x', kind: 'subsystem', title: 'X', layer: 'domain' })

    const result = mergeAnalyzerOutputs([
      makeOutput('analyzer-a', [nodeA], []),
      makeOutput('analyzer-b', [nodeB], []),
    ])

    expect(result.nodes).toHaveLength(1)
    const nodeLayer = result.nodes[0]
    assert(nodeLayer !== undefined)
    expect(nodeLayer.layer).toBe('domain') // prefer non-unknown
  })

  it('status first-wins with unknown preference: prefer non-unknown', () => {
    const nodeA = makeNode({ id: 'subsystem:x', kind: 'subsystem', title: 'X', status: 'unknown' })
    const nodeB = makeNode({ id: 'subsystem:x', kind: 'subsystem', title: 'X', status: 'shipped' })

    const result = mergeAnalyzerOutputs([
      makeOutput('analyzer-a', [nodeA], []),
      makeOutput('analyzer-b', [nodeB], []),
    ])

    expect(result.nodes).toHaveLength(1)
    const nodeStatus = result.nodes[0]
    assert(nodeStatus !== undefined)
    expect(nodeStatus.status).toBe('shipped') // prefer non-unknown
  })

  it('node metadata shallow merge: later overrides on key collision', () => {
    const nodeA = makeNode({
      id: 'subsystem:x',
      kind: 'subsystem',
      title: 'X',
      metadata: { foo: 'a', bar: 1 },
    })
    const nodeB = makeNode({
      id: 'subsystem:x',
      kind: 'subsystem',
      title: 'X',
      metadata: { foo: 'b', baz: 2 },
    })

    const result = mergeAnalyzerOutputs([
      makeOutput('analyzer-a', [nodeA], []),
      makeOutput('analyzer-b', [nodeB], []),
    ])

    expect(result.nodes).toHaveLength(1)
    const nodeMeta = result.nodes[0]
    assert(nodeMeta !== undefined)
    expect(nodeMeta.metadata).toEqual({ foo: 'b', bar: 1, baz: 2 })
  })

  it('edge category: both non-structural same value → keep value, no conflict', () => {
    const edgeDomain1 = makeEdge({
      id: 'edge-1',
      from: 'file:a',
      to: 'file:b',
      kind: 'imports',
      source: 'ast',
      confidence: 'high',
      category: 'domain',
    })
    const edgeDomain2 = makeEdge({
      id: 'edge-2',
      from: 'file:a',
      to: 'file:b',
      kind: 'imports',
      source: 'ast',
      confidence: 'high',
      category: 'domain',
    })

    const result = mergeAnalyzerOutputs([
      makeOutput('analyzer-a', [], [edgeDomain1]),
      makeOutput('analyzer-b', [], [edgeDomain2]),
    ])

    expect(result.edges).toHaveLength(1)
    const edgeSame = result.edges[0]
    assert(edgeSame !== undefined)
    expect(edgeSame.category).toBe('domain')
  })

  it('evidenceIds union preserves order: existing first, then new in order, no duplicates', () => {
    const edgeA = makeEdge({
      id: 'edge-1',
      from: 'file:a',
      to: 'file:b',
      kind: 'imports',
      source: 'ast',
      confidence: 'high',
      evidenceIds: ['ev1', 'ev2'],
    })
    const edgeB = makeEdge({
      id: 'edge-2',
      from: 'file:a',
      to: 'file:b',
      kind: 'imports',
      source: 'ast',
      confidence: 'high',
      evidenceIds: ['ev2', 'ev3'], // ev2 is a duplicate
    })

    const result = mergeAnalyzerOutputs([
      makeOutput('analyzer-a', [], [edgeA]),
      makeOutput('analyzer-b', [], [edgeB]),
    ])

    expect(result.edges).toHaveLength(1)
    const edgeOrder = result.edges[0]
    assert(edgeOrder !== undefined)
    // ev1 + ev2 from first, ev3 from second (ev2 deduped)
    expect(edgeOrder.evidenceIds).toEqual(['ev1', 'ev2', 'ev3'])
  })

  it('confidence worst-wins: medium and high → medium', () => {
    const edgeMedium = makeEdge({
      id: 'edge-1',
      from: 'file:a',
      to: 'file:b',
      kind: 'imports',
      source: 'ast',
      confidence: 'medium',
    })
    const edgeHigh = makeEdge({
      id: 'edge-2',
      from: 'file:a',
      to: 'file:b',
      kind: 'imports',
      source: 'ast',
      confidence: 'high',
    })

    const result = mergeAnalyzerOutputs([
      makeOutput('analyzer-a', [], [edgeMedium]),
      makeOutput('analyzer-b', [], [edgeHigh]),
    ])

    expect(result.edges).toHaveLength(1)
    const edgeMed = result.edges[0]
    assert(edgeMed !== undefined)
    expect(edgeMed.confidence).toBe('medium')
  })
})
