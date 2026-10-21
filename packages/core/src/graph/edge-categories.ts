import type { EdgeKind } from '../schema/common.js'
import type { Edge } from '../schema/edge.js'

/**
 * Dependency edges: `from -> to` means "from depends on to".
 * Participate in blast radius and v0 detectors (cycles, fan-in/out, orphans).
 */
export const DEPENDENCY_EDGE_KINDS = [
  'imports',
  'depends_on',
  'calls',
] as const satisfies readonly EdgeKind[]

/**
 * Relationship edges: structural composition (e.g. subsystem `contains` file).
 * Do NOT participate in blast radius or v0 detectors by default.
 */
export const RELATIONSHIP_EDGE_KINDS = ['contains', 'owns'] as const satisfies readonly EdgeKind[]

export type DependencyEdgeKind = (typeof DEPENDENCY_EDGE_KINDS)[number]
export type RelationshipEdgeKind = (typeof RELATIONSHIP_EDGE_KINDS)[number]

export function isDependencyEdge(edge: Pick<Edge, 'kind'>): boolean {
  return (DEPENDENCY_EDGE_KINDS as readonly EdgeKind[]).includes(edge.kind)
}

export function isRelationshipEdge(edge: Pick<Edge, 'kind'>): boolean {
  return (RELATIONSHIP_EDGE_KINDS as readonly EdgeKind[]).includes(edge.kind)
}

/**
 * "Purely type-only": carries type-only weight and ZERO runtime/dynamic weight
 * (e.g. a TS `import type`). Erased at runtime → not runtime/architectural
 * coupling. Note: declarative depends_on edges (YAML/config, tables) may be
 * all-zero — those have typeOnlyWeight === 0, so they are NOT purely type-only.
 */
export function isPurelyTypeOnlyEdge(
  edge: Pick<Edge, 'runtimeWeight' | 'typeOnlyWeight' | 'dynamicWeight'>,
): boolean {
  return edge.typeOnlyWeight > 0 && edge.runtimeWeight === 0 && edge.dynamicWeight === 0
}

/**
 * Runtime-coupling edge: a dependency edge that is NOT purely type-only.
 * Use this (instead of isDependencyEdge) for coupling analysis: cycles,
 * fan-in/out, orphans, layer/boundary rules, Overview hubs.
 */
export function isRuntimeCouplingEdge(
  edge: Pick<Edge, 'kind' | 'runtimeWeight' | 'typeOnlyWeight' | 'dynamicWeight'>,
): boolean {
  return isDependencyEdge(edge) && !isPurelyTypeOnlyEdge(edge)
}
