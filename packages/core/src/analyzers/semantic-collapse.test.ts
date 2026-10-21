import assert from 'node:assert'
import { describe, expect, it } from 'vitest'
import type { Edge } from '../schema/edge.js'
import type { Node } from '../schema/node.js'
import {
  type SemanticCollapseInput,
  collapseImportsToSubsystemDependsOn,
} from './semantic-collapse.js'

// ---------------------------------------------------------------------------
// Helpers: default field values for constructing test fixtures cleanly
// ---------------------------------------------------------------------------

function makeSubsystemNode(id: string, title: string): Node {
  return {
    id,
    kind: 'subsystem' as const,
    title,
    layer: 'unknown' as const,
    status: 'unknown' as const,
    tags: [],
    files: [],
    metadata: {},
  }
}

function makeFileNode(id: string, title: string): Node {
  return {
    id,
    kind: 'file' as const,
    title,
    layer: 'unknown' as const,
    status: 'unknown' as const,
    tags: [],
    files: [],
    metadata: {},
  }
}

function makeContainsEdge(id: string, from: string, to: string): Edge {
  return {
    id,
    from,
    to,
    kind: 'contains' as const,
    category: 'structural' as const,
    source: 'derived' as const,
    confidence: 'high' as const,
    evidenceIds: [],
    weight: 1,
    runtimeWeight: 0,
    typeOnlyWeight: 0,
    dynamicWeight: 0,
    metadata: {},
  }
}

function makeImportsEdge(
  id: string,
  from: string,
  to: string,
  opts: {
    runtimeWeight: number
    typeOnlyWeight: number
    dynamicWeight: number
    weight: number
    evidenceIds: string[]
  },
): Edge {
  return {
    id,
    from,
    to,
    kind: 'imports' as const,
    category: 'structural' as const,
    source: 'ast' as const,
    confidence: 'high' as const,
    evidenceIds: opts.evidenceIds,
    weight: opts.weight,
    runtimeWeight: opts.runtimeWeight,
    typeOnlyWeight: opts.typeOnlyWeight,
    dynamicWeight: opts.dynamicWeight,
    metadata: {},
  }
}

// ---------------------------------------------------------------------------
// Test 1: 3-subsystem fixture — cross-boundary aggregation
// ---------------------------------------------------------------------------

describe('collapseImportsToSubsystemDependsOn', () => {
  it('Test 1 — 3-subsystem fixture: derives correct cross-boundary depends_on edges', () => {
    const input: SemanticCollapseInput = {
      nodes: [
        makeSubsystemNode('subsystem:auth', 'Auth'),
        makeSubsystemNode('subsystem:billing', 'Billing'),
        makeSubsystemNode('subsystem:shared', 'Shared'),
        makeFileNode('file:src/auth/login.ts', 'login.ts'),
        makeFileNode('file:src/auth/logout.ts', 'logout.ts'),
        makeFileNode('file:src/billing/charge.ts', 'charge.ts'),
        makeFileNode('file:src/shared/util.ts', 'util.ts'),
      ],
      edges: [
        // contains edges: subsystem → file
        makeContainsEdge('c1', 'subsystem:auth', 'file:src/auth/login.ts'),
        makeContainsEdge('c2', 'subsystem:auth', 'file:src/auth/logout.ts'),
        makeContainsEdge('c3', 'subsystem:billing', 'file:src/billing/charge.ts'),
        makeContainsEdge('c4', 'subsystem:shared', 'file:src/shared/util.ts'),

        // imports edges: cross-boundary
        // auth/login → shared/util (cross-boundary)
        makeImportsEdge('i1', 'file:src/auth/login.ts', 'file:src/shared/util.ts', {
          runtimeWeight: 1,
          typeOnlyWeight: 0,
          dynamicWeight: 0,
          weight: 1,
          evidenceIds: ['ev1'],
        }),
        // auth/logout → shared/util (cross-boundary, same direction)
        makeImportsEdge('i2', 'file:src/auth/logout.ts', 'file:src/shared/util.ts', {
          runtimeWeight: 1,
          typeOnlyWeight: 1,
          dynamicWeight: 0,
          weight: 2,
          evidenceIds: ['ev2', 'ev3'],
        }),
        // billing/charge → shared/util (cross-boundary)
        makeImportsEdge('i3', 'file:src/billing/charge.ts', 'file:src/shared/util.ts', {
          runtimeWeight: 0,
          typeOnlyWeight: 0,
          dynamicWeight: 1,
          weight: 1,
          evidenceIds: ['ev4'],
        }),
        // intra-auth: login → logout (SAME subsystem — must be skipped)
        makeImportsEdge('i4', 'file:src/auth/login.ts', 'file:src/auth/logout.ts', {
          runtimeWeight: 1,
          typeOnlyWeight: 0,
          dynamicWeight: 0,
          weight: 1,
          evidenceIds: ['ev5'],
        }),
      ],
    }

    const result = collapseImportsToSubsystemDependsOn(input)

    // Exactly 2 derived edges (auth→shared and billing→shared)
    expect(result.edges).toHaveLength(2)

    // auth → shared: aggregates i1 + i2
    const authToShared = result.edges.find(
      (e) => e.from === 'subsystem:auth' && e.to === 'subsystem:shared',
    )
    assert(authToShared !== undefined, 'authToShared edge should exist')
    expect(authToShared.kind).toBe('depends_on')
    expect(authToShared.category).toBe('domain')
    expect(authToShared.source).toBe('derived')
    expect(authToShared.confidence).toBe('medium')
    expect(authToShared.runtimeWeight).toBe(2) // 1 + 1
    expect(authToShared.typeOnlyWeight).toBe(1) // 0 + 1
    expect(authToShared.dynamicWeight).toBe(0) // 0 + 0
    expect(authToShared.evidenceIds.sort()).toEqual(['ev1', 'ev2', 'ev3'].sort())
    expect(authToShared.metadata).toEqual({})
    // id is deterministic
    expect(authToShared.id).toBe('subsystem:auth->subsystem:shared:depends_on')

    // billing → shared: from i3 only
    const billingToShared = result.edges.find(
      (e) => e.from === 'subsystem:billing' && e.to === 'subsystem:shared',
    )
    assert(billingToShared !== undefined, 'billingToShared edge should exist')
    expect(billingToShared.kind).toBe('depends_on')
    expect(billingToShared.category).toBe('domain')
    expect(billingToShared.source).toBe('derived')
    expect(billingToShared.confidence).toBe('medium')
    expect(billingToShared.runtimeWeight).toBe(0)
    expect(billingToShared.typeOnlyWeight).toBe(0)
    expect(billingToShared.dynamicWeight).toBe(1)
    expect(billingToShared.evidenceIds).toEqual(['ev4'])
    expect(billingToShared.metadata).toEqual({})

    // No self-loops (intra-subsystem skipped)
    expect(result.edges.every((e) => e.from !== e.to)).toBe(true)

    // The intra-auth import (i4) must NOT produce any edge
    const authToAuth = result.edges.find(
      (e) => e.from === 'subsystem:auth' && e.to === 'subsystem:auth',
    )
    expect(authToAuth).toBeUndefined()
  })

  // ---------------------------------------------------------------------------
  // Test 2: external imports must be skipped (no subsystem for external nodes)
  // ---------------------------------------------------------------------------

  it('Test 2 — external imports: edges targeting external nodes produce no derived edge', () => {
    const input: SemanticCollapseInput = {
      nodes: [
        makeSubsystemNode('subsystem:app', 'App'),
        makeFileNode('file:src/app/index.ts', 'index.ts'),
      ],
      edges: [
        makeContainsEdge('c1', 'subsystem:app', 'file:src/app/index.ts'),
        // import of external:react — external node has no contains edge → no subsystem
        makeImportsEdge('i1', 'file:src/app/index.ts', 'external:react', {
          runtimeWeight: 1,
          typeOnlyWeight: 0,
          dynamicWeight: 0,
          weight: 1,
          evidenceIds: ['ev-react'],
        }),
        // import of external:lodash
        makeImportsEdge('i2', 'file:src/app/index.ts', 'external:lodash', {
          runtimeWeight: 0,
          typeOnlyWeight: 1,
          dynamicWeight: 0,
          weight: 1,
          evidenceIds: ['ev-lodash'],
        }),
      ],
    }

    const result = collapseImportsToSubsystemDependsOn(input)

    // No derived edges — external nodes have no subsystem
    expect(result.edges).toHaveLength(0)
  })

  // ---------------------------------------------------------------------------
  // Test 3: empty input
  // ---------------------------------------------------------------------------

  it('Test 3 — empty input: returns empty edges', () => {
    const result = collapseImportsToSubsystemDependsOn({ nodes: [], edges: [] })
    expect(result.edges).toHaveLength(0)
    expect(result.edges).toEqual([])
  })

  // ---------------------------------------------------------------------------
  // Test 4: no imports edges at all (only contains edges)
  // ---------------------------------------------------------------------------

  it('Test 4 — no imports edges: returns empty edges', () => {
    const input: SemanticCollapseInput = {
      nodes: [
        makeSubsystemNode('subsystem:auth', 'Auth'),
        makeFileNode('file:src/auth/login.ts', 'login.ts'),
      ],
      edges: [makeContainsEdge('c1', 'subsystem:auth', 'file:src/auth/login.ts')],
    }

    const result = collapseImportsToSubsystemDependsOn(input)
    expect(result.edges).toHaveLength(0)
  })

  // ---------------------------------------------------------------------------
  // Test 5: output edges are only depends_on, not input edges
  // ---------------------------------------------------------------------------

  it('Test 5 — output contains only newly-derived depends_on edges, not input edges', () => {
    const input: SemanticCollapseInput = {
      nodes: [
        makeSubsystemNode('subsystem:a', 'A'),
        makeSubsystemNode('subsystem:b', 'B'),
        makeFileNode('file:src/a/x.ts', 'x.ts'),
        makeFileNode('file:src/b/y.ts', 'y.ts'),
      ],
      edges: [
        makeContainsEdge('c1', 'subsystem:a', 'file:src/a/x.ts'),
        makeContainsEdge('c2', 'subsystem:b', 'file:src/b/y.ts'),
        makeImportsEdge('i1', 'file:src/a/x.ts', 'file:src/b/y.ts', {
          runtimeWeight: 1,
          typeOnlyWeight: 0,
          dynamicWeight: 0,
          weight: 1,
          evidenceIds: ['ev1'],
        }),
      ],
    }

    const result = collapseImportsToSubsystemDependsOn(input)

    // Only 1 derived depends_on edge
    expect(result.edges).toHaveLength(1)
    // All output edges must have kind 'depends_on'
    expect(result.edges.every((e) => e.kind === 'depends_on')).toBe(true)
    // None are 'contains' or 'imports'
    expect(result.edges.some((e) => e.kind === 'contains')).toBe(false)
    expect(result.edges.some((e) => e.kind === 'imports')).toBe(false)
  })

  // ---------------------------------------------------------------------------
  // Test 6: file in multiple subsystems — defensive: first mapping wins
  // ---------------------------------------------------------------------------

  it('Test 6 — file appearing in multiple contains edges: first mapping wins (defensive)', () => {
    const input: SemanticCollapseInput = {
      nodes: [
        makeSubsystemNode('subsystem:first', 'First'),
        makeSubsystemNode('subsystem:second', 'Second'),
        makeSubsystemNode('subsystem:target', 'Target'),
        makeFileNode('file:src/shared/util.ts', 'util.ts'),
        makeFileNode('file:src/target/a.ts', 'a.ts'),
      ],
      edges: [
        // util.ts claimed by two subsystems — first wins
        makeContainsEdge('c1', 'subsystem:first', 'file:src/shared/util.ts'),
        makeContainsEdge('c2', 'subsystem:second', 'file:src/shared/util.ts'),
        makeContainsEdge('c3', 'subsystem:target', 'file:src/target/a.ts'),
        // util imports a.ts → first→target (not second→target)
        makeImportsEdge('i1', 'file:src/shared/util.ts', 'file:src/target/a.ts', {
          runtimeWeight: 1,
          typeOnlyWeight: 0,
          dynamicWeight: 0,
          weight: 1,
          evidenceIds: ['ev1'],
        }),
      ],
    }

    const result = collapseImportsToSubsystemDependsOn(input)

    expect(result.edges).toHaveLength(1)
    const derived = result.edges[0]
    assert(derived !== undefined)
    // 'first' wins because c1 appears before c2 in the edges array
    expect(derived.from).toBe('subsystem:first')
    expect(derived.to).toBe('subsystem:target')
  })

  // ---------------------------------------------------------------------------
  // Test 7: hardening — import target not owned by any `contains` edge (e.g. a
  // built dist file excluded from indexing) still collapses when its path
  // matches a subsystem `match` glob. Defense-in-depth so a resolution gap
  // (package without a discoverable src entry) can't silently drop a real dep.
  // ---------------------------------------------------------------------------

  it('Test 7 — fallback: unowned import target matching a subsystem match glob still collapses', () => {
    const input: SemanticCollapseInput = {
      nodes: [
        makeSubsystemNode('subsystem:a', 'A'),
        makeSubsystemNode('subsystem:b', 'B'),
        makeFileNode('file:packages/pkg-b/src/index.ts', 'index.ts'),
        // No node / contains edge for pkg-a's dist target — it's excluded from indexing.
      ],
      edges: [
        makeContainsEdge('c1', 'subsystem:b', 'file:packages/pkg-b/src/index.ts'),
        // pkg-b imports pkg-a's built output (unowned file).
        makeImportsEdge(
          'i1',
          'file:packages/pkg-b/src/index.ts',
          'file:packages/pkg-a/dist/index.d.ts',
          {
            runtimeWeight: 1,
            typeOnlyWeight: 0,
            dynamicWeight: 0,
            weight: 1,
            evidenceIds: ['ev1'],
          },
        ),
      ],
      subsystems: [
        { id: 'a', match: ['packages/pkg-a/**'] },
        { id: 'b', match: ['packages/pkg-b/**'] },
      ],
    }

    const result = collapseImportsToSubsystemDependsOn(input)

    const bToA = result.edges.find((e) => e.from === 'subsystem:b' && e.to === 'subsystem:a')
    assert(bToA !== undefined, 'b->a derived edge should exist via match-glob fallback')
    expect(bToA.kind).toBe('depends_on')
    expect(bToA.source).toBe('derived')
  })

  // ---------------------------------------------------------------------------
  // Test 8: the fallback must NOT fabricate edges for external targets.
  // ---------------------------------------------------------------------------

  it('Test 8 — fallback does not apply to external targets even when subsystems are provided', () => {
    const input: SemanticCollapseInput = {
      nodes: [
        makeSubsystemNode('subsystem:app', 'App'),
        makeFileNode('file:packages/app/src/index.ts', 'index.ts'),
      ],
      edges: [
        makeContainsEdge('c1', 'subsystem:app', 'file:packages/app/src/index.ts'),
        makeImportsEdge('i1', 'file:packages/app/src/index.ts', 'external:react', {
          runtimeWeight: 1,
          typeOnlyWeight: 0,
          dynamicWeight: 0,
          weight: 1,
          evidenceIds: ['ev1'],
        }),
      ],
      subsystems: [{ id: 'app', match: ['packages/app/**'] }],
    }

    const result = collapseImportsToSubsystemDependsOn(input)
    expect(result.edges).toHaveLength(0)
  })
})
