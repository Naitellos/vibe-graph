import picomatch = require('picomatch')
import type { Edge } from '../schema/edge.js'
import type { Node } from '../schema/node.js'

export interface SemanticCollapseInput {
  nodes: readonly Node[]
  edges: readonly Edge[]
  /**
   * Optional subsystem ownership rules (id + match globs). Used as a fallback
   * to map an import endpoint to a subsystem when no `contains` edge owns it —
   * e.g. an import resolving to a built `dist/*.d.ts` that is excluded from
   * indexing. Defense-in-depth so a resolution gap can't silently drop a dep.
   */
  subsystems?: readonly { id: string; match: readonly string[] }[]
}

export interface SemanticCollapseResult {
  edges: Edge[] // newly-derived subsystem→subsystem depends_on edges
}

interface AggregationEntry {
  runtimeWeight: number
  typeOnlyWeight: number
  dynamicWeight: number
  evidenceIds: string[]
}

/**
 * Derive `subsystem→subsystem depends_on` edges from file→file `imports` edges
 * that cross subsystem boundaries.
 *
 * Pure function — no I/O, no async.
 */
export function collapseImportsToSubsystemDependsOn(
  input: SemanticCollapseInput,
): SemanticCollapseResult {
  // -------------------------------------------------------------------------
  // Step 1: build fileToSubsystem map from `contains` edges
  //   Key:   edge.to  (the file node id, e.g. `file:src/auth/login.ts`)
  //   Value: edge.from (the subsystem node id, e.g. `subsystem:auth`)
  // First occurrence wins (defensive: shouldn't happen per Task 2.17 contract).
  // -------------------------------------------------------------------------
  const fileToSubsystem = new Map<string, string>()
  for (const edge of input.edges) {
    if (edge.kind !== 'contains') continue
    if (!fileToSubsystem.has(edge.to)) {
      fileToSubsystem.set(edge.to, edge.from)
    }
  }

  // Resolve a file node id to its owning subsystem id (e.g. `subsystem:core`).
  // Prefers an explicit `contains` mapping; falls back to matching the file's
  // path against subsystem `match` globs so unindexed targets (built dist files)
  // are still attributed. Never applies to `external:` nodes.
  const subsystems = input.subsystems ?? []
  function resolveSubsystem(fileNodeId: string): string | undefined {
    const owned = fileToSubsystem.get(fileNodeId)
    if (owned !== undefined) return owned
    if (!fileNodeId.startsWith('file:')) return undefined
    const relPath = fileNodeId.slice('file:'.length)
    for (const sub of subsystems) {
      if (picomatch.isMatch(relPath, sub.match as string[])) return `subsystem:${sub.id}`
    }
    return undefined
  }

  // -------------------------------------------------------------------------
  // Step 2: aggregate cross-boundary imports into Map keyed by `fromSub|toSub`
  // -------------------------------------------------------------------------
  const aggregation = new Map<string, AggregationEntry>()

  for (const edge of input.edges) {
    if (edge.kind !== 'imports') continue

    const fromSub = resolveSubsystem(edge.from)
    const toSub = resolveSubsystem(edge.to)

    // Skip if either file is not in any subsystem (e.g. external nodes)
    if (fromSub === undefined || toSub === undefined) continue

    // Skip intra-subsystem imports
    if (fromSub === toSub) continue

    const key = `${fromSub}|${toSub}`
    const existing = aggregation.get(key)
    if (existing === undefined) {
      aggregation.set(key, {
        runtimeWeight: edge.runtimeWeight,
        typeOnlyWeight: edge.typeOnlyWeight,
        dynamicWeight: edge.dynamicWeight,
        evidenceIds: [...edge.evidenceIds],
      })
    } else {
      existing.runtimeWeight += edge.runtimeWeight
      existing.typeOnlyWeight += edge.typeOnlyWeight
      existing.dynamicWeight += edge.dynamicWeight
      for (const evId of edge.evidenceIds) {
        existing.evidenceIds.push(evId)
      }
    }
  }

  // -------------------------------------------------------------------------
  // Step 3: emit one depends_on Edge per aggregation entry
  // Sort deterministically by key for stable output order.
  // -------------------------------------------------------------------------
  const sortedKeys = [...aggregation.keys()].sort()
  const derivedEdges: Edge[] = []

  for (const key of sortedKeys) {
    const entry = aggregation.get(key)
    // entry is always defined here — key came from aggregation.keys()
    if (entry === undefined) continue

    const sepIdx = key.indexOf('|')
    const fromSub = key.slice(0, sepIdx)
    const toSub = key.slice(sepIdx + 1)

    const totalWeight = entry.runtimeWeight + entry.typeOnlyWeight + entry.dynamicWeight

    const edge: Edge = {
      id: `${fromSub}->${toSub}:depends_on`,
      from: fromSub,
      to: toSub,
      kind: 'depends_on' as const,
      category: 'domain' as const,
      source: 'derived' as const,
      confidence: 'medium' as const,
      evidenceIds: entry.evidenceIds,
      weight: totalWeight > 0 ? totalWeight : 1,
      runtimeWeight: entry.runtimeWeight,
      typeOnlyWeight: entry.typeOnlyWeight,
      dynamicWeight: entry.dynamicWeight,
      metadata: {},
    }

    derivedEdges.push(edge)
  }

  return { edges: derivedEdges }
}
