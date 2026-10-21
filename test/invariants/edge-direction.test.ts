/**
 * Invariant: computeBlastRadius traverses INCOMING dependency edges.
 *
 * Blast radius answers "who breaks if I change X?" — it must follow
 * edgesByTargetId (consumers of X), not edgesByNodeId (dependencies of X).
 *
 * Empirical proof via deliberate asymmetric graph:
 *   A → B  ("A imports B"; A depends on B)
 *   edgesByTargetId['B'] = [A→B]  → blast radius of B includes A
 *   edgesByTargetId['A'] = []     → blast radius of A is empty
 */
import { describe, expect, it } from 'vitest'
import { computeBlastRadius } from '../../packages/core/src/helpers/blast-radius.js'
import type { Edge } from '../../packages/core/src/schema/edge.js'
import type { Node } from '../../packages/core/src/schema/node.js'
import type { Snapshot } from '../../packages/core/src/schema/snapshot.js'
import { buildLoadedSnapshot } from '../../packages/core/src/snapshot/load-snapshot.js'

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

// A dependency edge A→B: "A imports B" (A depends on B).
// kind='imports' participates in blast radius per DEPENDENCY_EDGE_KINDS.
function makeImportsEdge(from: string, to: string): Edge {
  return {
    id: `edge:${from}:${to}:imports`,
    from,
    to,
    kind: 'imports',
    category: 'structural',
    source: 'ast',
    confidence: 'high',
    evidenceIds: [],
    weight: 1,
    runtimeWeight: 0,
    typeOnlyWeight: 0,
    dynamicWeight: 0,
    metadata: {},
  }
}

function makeTwoNodeSnapshot(from: string, to: string) {
  const snap: Snapshot = {
    meta: {
      schemaVersion: '0.1.0',
      scanId: '11111111-1111-4111-8111-111111111111',
      builtAt: '2026-05-25T00:00:00.000Z',
      projectRoot: '/invariants-test',
      projectName: 'invariants-test',
      vibegraphVersion: '0.0.0',
      scanDurationMs: 0,
      fileCounts: { scanned: 2, indexed: 2, skipped: 0 },
    },
    nodes: [makeNode(from), makeNode(to)],
    edges: [makeImportsEdge(from, to)],
    evidence: [],
    findings: [],
  }
  return buildLoadedSnapshot(snap)
}

describe('invariant: computeBlastRadius uses edgesByTargetId (incoming edges)', () => {
  // Graph: A → B (A imports B; A depends on B)
  const snapshot = makeTwoNodeSnapshot('A', 'B')

  it('blast radius of B includes A (A is a direct consumer of B)', () => {
    // B is the target: if B changes, A breaks because A imports B.
    // edgesByTargetId['B'] = [edge A→B], so A is a direct consumer.
    const result = computeBlastRadius(snapshot, 'B')
    expect(result.direct).toContain('A')
    expect(result.totalAffected).toBeGreaterThanOrEqual(1)
  })

  it('blast radius of A is empty (A has no incoming dependency edges)', () => {
    // A is the target: nothing imports A, so blast radius is empty.
    // edgesByTargetId['A'] = [], so no consumers.
    const result = computeBlastRadius(snapshot, 'A')
    expect(result.direct).toEqual([])
    expect(result.transitive).toEqual([])
    expect(result.totalAffected).toBe(0)
  })

  it('blast radius of B does NOT include itself', () => {
    const result = computeBlastRadius(snapshot, 'B')
    expect(result.direct).not.toContain('B')
    expect(result.transitive).not.toContain('B')
  })
})
