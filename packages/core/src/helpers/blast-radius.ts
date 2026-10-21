import { DEPENDENCY_EDGE_KINDS } from '../graph/edge-categories.js'
import type { LoadedSnapshot } from '../snapshot/load-snapshot.js'

export interface BlastRadiusOptions {
  /**
   * Max BFS depth when traversing incoming dependency edges.
   * Default 5. Use Number.POSITIVE_INFINITY for unbounded traversal.
   * @default 5
   */
  maxDepth?: number
  /**
   * Optional edge-kind filter.
   * Default = DEPENDENCY_EDGE_KINDS ('imports', 'depends_on', 'calls').
   */
  edgeKinds?: readonly string[]
}

export interface BlastRadiusResult {
  /** Node ids one edge away (direct consumers of targetId). */
  direct: string[]
  /**
   * Node ids 2+ edges away that depend on targetId transitively,
   * excluding direct set and cycles set.
   */
  transitive: string[]
  /**
   * Node ids that are in a cycle WITH the target — i.e. targetId depends on
   * them AND they depend on targetId transitively. These are NOT counted in
   * totalAffected to avoid double-counting.
   */
  cycles: string[]
  /**
   * direct.length + transitive.length.
   * Cycle nodes are intentionally excluded — they're a separate informational
   * bucket. A node in a cycle with the target appears only in `cycles`.
   */
  totalAffected: number
}

/**
 * Compute the blast radius of `targetId` in `snapshot`.
 *
 * "Blast radius" answers: if I change node X, what other nodes are affected?
 * We traverse INCOMING dependency edges (edgesByTargetId) because we want
 * "who depends on me" — the inverse of the dependency direction.
 *
 * Design notes:
 * - Cycle nodes are excluded from direct/transitive and reported separately.
 * - totalAffected does NOT include cycles (no double-counting).
 * - All output arrays are sorted alphabetically for determinism.
 * - Unknown targetId → empty result, no error.
 */
export function computeBlastRadius(
  snapshot: LoadedSnapshot,
  targetId: string,
  options: BlastRadiusOptions = {},
): BlastRadiusResult {
  const empty: BlastRadiusResult = {
    direct: [],
    transitive: [],
    cycles: [],
    totalAffected: 0,
  }

  // Edge case: target not in snapshot
  if (!snapshot.nodesById.has(targetId)) {
    return empty
  }

  const maxDepth = options.maxDepth ?? 5
  const kinds = new Set<string>(options.edgeKinds ?? DEPENDENCY_EDGE_KINDS)

  // maxDepth=0 → nothing to visit
  if (maxDepth <= 0) {
    return empty
  }

  // ── Phase 1: BFS over incoming dep edges ────────────────────────────────────
  // directCandidates: nodes at depth 1
  // transitiveCandidates: nodes at depth 2+
  const directCandidates = new Set<string>()
  const transitiveCandidates = new Set<string>()
  const visited = new Set<string>([targetId])

  const queue: Array<{ nodeId: string; depth: number }> = [{ nodeId: targetId, depth: 0 }]

  while (queue.length > 0) {
    const item = queue.shift()
    if (item === undefined) break

    const { nodeId, depth } = item
    const incomingEdges = snapshot.edgesByTargetId.get(nodeId) ?? []

    for (const edge of incomingEdges) {
      if (!kinds.has(edge.kind)) continue

      const neighbor = edge.from
      if (visited.has(neighbor)) continue
      if (depth + 1 > maxDepth) continue

      visited.add(neighbor)

      if (depth === 0) {
        // Parent was the target — this is a direct consumer
        directCandidates.add(neighbor)
      } else {
        transitiveCandidates.add(neighbor)
      }

      queue.push({ nodeId: neighbor, depth: depth + 1 })
    }
  }

  // ── Phase 2: Cycle detection ─────────────────────────────────────────────────
  // Forward BFS from targetId over outgoing dep edges to find all nodes that
  // targetId can reach (directly or transitively).
  const forwardReachable = new Set<string>()
  const forwardQueue: string[] = [targetId]
  const forwardVisited = new Set<string>([targetId])

  while (forwardQueue.length > 0) {
    const current = forwardQueue.shift()
    if (current === undefined) break

    const outgoingEdges = snapshot.edgesByNodeId.get(current) ?? []
    for (const edge of outgoingEdges) {
      if (!kinds.has(edge.kind)) continue

      const neighbor = edge.to
      if (forwardVisited.has(neighbor)) continue

      forwardVisited.add(neighbor)
      forwardReachable.add(neighbor)
      forwardQueue.push(neighbor)
    }
  }

  // Nodes that are both reachable from target AND depend on target → in a cycle
  const cycleSet = new Set<string>()
  for (const nodeId of visited) {
    if (nodeId === targetId) continue
    if (forwardReachable.has(nodeId)) {
      cycleSet.add(nodeId)
    }
  }

  // ── Phase 3: Build result sets, removing cycle nodes from direct/transitive ─
  const direct: string[] = []
  for (const id of directCandidates) {
    if (!cycleSet.has(id)) direct.push(id)
  }

  const transitive: string[] = []
  for (const id of transitiveCandidates) {
    if (!cycleSet.has(id)) transitive.push(id)
  }

  const cycles = Array.from(cycleSet).sort()
  direct.sort()
  transitive.sort()

  return {
    direct,
    transitive,
    cycles,
    totalAffected: direct.length + transitive.length,
  }
}
