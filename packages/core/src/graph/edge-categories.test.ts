import { describe, expect, it } from 'vitest'
import { type Edge, EdgeSchema } from '../schema/edge.js'
import {
  DEPENDENCY_EDGE_KINDS,
  RELATIONSHIP_EDGE_KINDS,
  isDependencyEdge,
  isPurelyTypeOnlyEdge,
  isRelationshipEdge,
  isRuntimeCouplingEdge,
} from './edge-categories.js'

const dep = EdgeSchema.parse({
  id: 'a->b:imports',
  from: 'a',
  to: 'b',
  kind: 'imports',
  source: 'ast',
  confidence: 'high',
})

const rel = EdgeSchema.parse({
  id: 'sub->file:contains',
  from: 'subsystem:oracle',
  to: 'file:oracle.ts',
  kind: 'contains',
  source: 'derived',
  confidence: 'high',
})

describe('edge categories', () => {
  it('DEPENDENCY_EDGE_KINDS contains imports/depends_on/calls', () => {
    expect(DEPENDENCY_EDGE_KINDS).toContain('imports')
    expect(DEPENDENCY_EDGE_KINDS).toContain('depends_on')
    expect(DEPENDENCY_EDGE_KINDS).toContain('calls')
    expect(DEPENDENCY_EDGE_KINDS).not.toContain('contains')
  })

  it('RELATIONSHIP_EDGE_KINDS contains contains/owns', () => {
    expect(RELATIONSHIP_EDGE_KINDS).toContain('contains')
    expect(RELATIONSHIP_EDGE_KINDS).toContain('owns')
  })

  it('isDependencyEdge identifies dependency edges', () => {
    expect(isDependencyEdge(dep)).toBe(true)
    expect(isDependencyEdge(rel)).toBe(false)
  })

  it('isRelationshipEdge identifies relationship edges', () => {
    expect(isRelationshipEdge(dep)).toBe(false)
    expect(isRelationshipEdge(rel)).toBe(true)
  })
})

function edge(
  kind: Edge['kind'],
  w: { runtime?: number; typeOnly?: number; dynamic?: number } = {},
): Edge {
  return {
    id: 'e',
    from: 'a',
    to: 'b',
    kind,
    category: 'structural',
    source: 'manual',
    confidence: 'high',
    evidenceIds: [],
    weight: 1,
    runtimeWeight: w.runtime ?? 0,
    typeOnlyWeight: w.typeOnly ?? 0,
    dynamicWeight: w.dynamic ?? 0,
    metadata: {},
  }
}

describe('isPurelyTypeOnlyEdge', () => {
  it('true only when typeOnly>0 and runtime+dynamic==0', () => {
    expect(isPurelyTypeOnlyEdge(edge('imports', { typeOnly: 1 }))).toBe(true)
    expect(isPurelyTypeOnlyEdge(edge('imports', { typeOnly: 1, runtime: 1 }))).toBe(false)
    expect(isPurelyTypeOnlyEdge(edge('imports', {}))).toBe(false)
  })
})

describe('isRuntimeCouplingEdge', () => {
  it('excludes purely type-only import edges', () => {
    expect(isRuntimeCouplingEdge(edge('imports', { typeOnly: 1 }))).toBe(false)
  })
  it('includes runtime and dynamic import edges', () => {
    expect(isRuntimeCouplingEdge(edge('imports', { runtime: 1 }))).toBe(true)
    expect(isRuntimeCouplingEdge(edge('imports', { dynamic: 1 }))).toBe(true)
  })
  it('includes mixed runtime+type-only edges', () => {
    expect(isRuntimeCouplingEdge(edge('depends_on', { runtime: 2, typeOnly: 3 }))).toBe(true)
  })
  it('includes all-zero declarative depends_on edges (YAML/table)', () => {
    expect(isRuntimeCouplingEdge(edge('depends_on', {}))).toBe(true)
  })
  it('returns false for non-dependency (contains) edges', () => {
    expect(isRuntimeCouplingEdge(edge('contains', { runtime: 1 }))).toBe(false)
  })
})
