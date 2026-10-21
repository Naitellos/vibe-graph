import { describe, expect, it } from 'vitest'
import type { Edge } from '../schema/edge.js'
import type { Node } from '../schema/node.js'
import type { Snapshot } from '../schema/snapshot.js'
import { buildLoadedSnapshot } from '../snapshot/load-snapshot.js'
import { computeBlastRadius } from './blast-radius.js'

// ── Test helpers ───────────────────────────────────────────────────────────────

function makeNode(id: string): Node {
  return {
    id,
    kind: 'file',
    title: id,
    layer: 'unknown',
    status: 'unknown',
    tags: [],
    files: [],
    metadata: {},
  }
}

function makeEdge(from: string, to: string, kind: Edge['kind'] = 'imports'): Edge {
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
      scanId: '11111111-1111-4111-8111-111111111111',
      builtAt: '2026-05-24T10:00:00.000Z',
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

// ── Tests ──────────────────────────────────────────────────────────────────────

/**
 * 5-node chain: a→b→c→d→e
 * Where "a→b" means "a imports b" (a depends on b).
 * edgesByTargetId:
 *   b ← a  (a imports b)
 *   c ← b  (b imports c)
 *   d ← c  (c imports d)
 *   e ← d  (d imports e)
 */
const chainNodes = ['a', 'b', 'c', 'd', 'e'].map(makeNode)
const chainEdges = [
  makeEdge('a', 'b'), // a depends on b
  makeEdge('b', 'c'), // b depends on c
  makeEdge('c', 'd'), // c depends on d
  makeEdge('d', 'e'), // d depends on e
]

describe('computeBlastRadius', () => {
  describe('Test 1: 5-node chain a→b→c→d→e', () => {
    const snap = makeSnapshot(chainNodes, chainEdges)

    it('blast radius of c: direct=[b], transitive=[a], totalAffected=2', () => {
      const result = computeBlastRadius(snap, 'c')
      expect(result.direct).toEqual(['b'])
      expect(result.transitive).toEqual(['a'])
      expect(result.cycles).toEqual([])
      expect(result.totalAffected).toBe(2)
    })

    it('blast radius of e (leaf): direct=[d], transitive=[a,b,c], totalAffected=4', () => {
      const result = computeBlastRadius(snap, 'e')
      expect(result.direct).toEqual(['d'])
      expect(result.transitive).toEqual(['a', 'b', 'c'])
      expect(result.cycles).toEqual([])
      expect(result.totalAffected).toBe(4)
    })

    it('blast radius of a (root, no consumers): all empty', () => {
      const result = computeBlastRadius(snap, 'a')
      expect(result.direct).toEqual([])
      expect(result.transitive).toEqual([])
      expect(result.cycles).toEqual([])
      expect(result.totalAffected).toBe(0)
    })
  })

  describe('Test 2: maxDepth=1 limits transitive', () => {
    it('target e, maxDepth=1: only direct=[d], no transitive', () => {
      const snap = makeSnapshot(chainNodes, chainEdges)
      const result = computeBlastRadius(snap, 'e', { maxDepth: 1 })
      expect(result.direct).toEqual(['d'])
      expect(result.transitive).toEqual([])
      expect(result.cycles).toEqual([])
      expect(result.totalAffected).toBe(1)
    })
  })

  describe('Test 3: cycle separation', () => {
    /**
     * Nodes a, b, c with edges a→b, b→c, c→a.
     * "a→b" means a depends on b (a imports b).
     * Blast radius of a:
     *   - incoming dep edges to a: c→a (c depends on a)
     *   - BFS backwards from a: visits c (depth 1), then b (depth 2)
     *   - initially: direct=[c], transitive=[b]
     *   - forward from a: a→b→c → forwardReachable={b,c}
     *   - intersection with visited: {b,c} → both in cycle with a
     *   - remove b,c from direct/transitive → direct=[], transitive=[]
     *   - cycles=[b,c]
     *   - totalAffected = 0 (cycles not counted)
     */
    it('cycle a→b→c→a: blast radius of a: direct=[], transitive=[], cycles=[b,c], totalAffected=0', () => {
      const nodes = ['a', 'b', 'c'].map(makeNode)
      const edges = [makeEdge('a', 'b'), makeEdge('b', 'c'), makeEdge('c', 'a')]
      const snap = makeSnapshot(nodes, edges)
      const result = computeBlastRadius(snap, 'a')
      expect(result.direct).toEqual([])
      expect(result.transitive).toEqual([])
      expect(result.cycles).toEqual(['b', 'c'])
      expect(result.totalAffected).toBe(0)
    })
  })

  describe('Test 4: edgeKinds filter', () => {
    it('edgeKinds=[contains] on imports-only chain: all empty', () => {
      const snap = makeSnapshot(chainNodes, chainEdges)
      const result = computeBlastRadius(snap, 'c', { edgeKinds: ['contains'] })
      expect(result.direct).toEqual([])
      expect(result.transitive).toEqual([])
      expect(result.cycles).toEqual([])
      expect(result.totalAffected).toBe(0)
    })
  })

  describe('Test 5: nonexistent target', () => {
    it('nonexistent target → empty result, no throw', () => {
      const snap = makeSnapshot(chainNodes, chainEdges)
      const result = computeBlastRadius(snap, 'nonexistent:foo')
      expect(result.direct).toEqual([])
      expect(result.transitive).toEqual([])
      expect(result.cycles).toEqual([])
      expect(result.totalAffected).toBe(0)
    })
  })

  describe('maxDepth edge cases', () => {
    it('maxDepth=0: all empty even with consumers', () => {
      const snap = makeSnapshot(chainNodes, chainEdges)
      const result = computeBlastRadius(snap, 'e', { maxDepth: 0 })
      expect(result.direct).toEqual([])
      expect(result.transitive).toEqual([])
      expect(result.cycles).toEqual([])
      expect(result.totalAffected).toBe(0)
    })

    it('maxDepth=Number.POSITIVE_INFINITY: unbounded traversal (same as default on linear chain)', () => {
      const snap = makeSnapshot(chainNodes, chainEdges)
      const result = computeBlastRadius(snap, 'e', { maxDepth: Number.POSITIVE_INFINITY })
      expect(result.direct).toEqual(['d'])
      expect(result.transitive).toEqual(['a', 'b', 'c'])
      expect(result.totalAffected).toBe(4)
    })
  })
})
