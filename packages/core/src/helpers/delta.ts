import type { Edge } from '../schema/edge.js'
import type { Finding } from '../schema/finding.js'
import type { Node } from '../schema/node.js'

// ---------------------------------------------------------------------------
// Change-scope helper — compute the set of node IDs "affected" by a set of
// changed file paths. Used by validate_diff to scope newViolations /
// removedViolations to findings actually related to the input diff, instead
// of leaking orphan/drift findings for unrelated parts of the repo (which
// vary between the cached snapshot and an on-the-fly working scan).
// ---------------------------------------------------------------------------

/**
 * Returns `{ file:<path> } ∪ { subsystem:<id> for each subsystem owning a
 * changed file }`. The `contains` edges supplied via `ownershipEdges` drive the
 * file→subsystem ownership map.
 *
 * IMPORTANT: pass `[...baseline.edges, ...working.edges]` so that newly-added or
 * renamed files (which have NO baseline `contains` edge) are correctly attributed to
 * their owning subsystem via the working scan's `contains` edges. The combined set
 * deduplicates naturally — only `contains` edges are read here.
 */
export function computeAffectedNodeIds(
  ownershipEdges: Edge[],
  changedFiles: string[],
  deletedFiles: string[] = [],
): Set<string> {
  const fileIds = new Set([...changedFiles, ...deletedFiles].map((p) => `file:${p}`))
  const subsystemIds = new Set<string>()
  for (const e of ownershipEdges) {
    if (e.kind === 'contains' && fileIds.has(e.to)) subsystemIds.add(e.from)
  }
  return new Set([...fileIds, ...subsystemIds])
}

/**
 * Returns true if `finding` is "relevant" to a set of affected node IDs —
 * i.e. at least one of its involvedNodeIds overlaps the affected set.
 * Findings with empty `involvedNodeIds` are kept (rare; safer default).
 */
export function isFindingInScope(finding: Finding, affectedNodeIds: Set<string>): boolean {
  if (finding.involvedNodeIds.length === 0) return true
  return finding.involvedNodeIds.some((id) => affectedNodeIds.has(id))
}

// ---------------------------------------------------------------------------
// "Worsening" predicate — shared by every consumer that compares two snapshots
// of the same finding by id and asks "did it get worse?".
// ---------------------------------------------------------------------------

const SEVERITY_RANK: Record<Finding['severity'], number> = {
  low: 0,
  medium: 1,
  high: 2,
}

const STATUS_RANK: Record<Finding['status'], number> = {
  resolved: 0,
  ignored: 0,
  accepted: 0,
  open: 1,
}

/**
 * Returns true when `after` represents a worsening of `before`:
 * - severity rose (low → medium, medium → high, etc.), OR
 * - status moved from a terminal state (resolved/ignored/accepted) to `open`.
 *
 * Caller is responsible for matching the two findings by id beforehand.
 */
export function isFindingWorse(before: Finding, after: Finding): boolean {
  if (SEVERITY_RANK[after.severity] > SEVERITY_RANK[before.severity]) return true
  return STATUS_RANK[after.status] > STATUS_RANK[before.status]
}

// ---------------------------------------------------------------------------
// Findings delta — "what's new or removed since baseline?"
//
// A finding counts as NEW if its id is absent from baseline OR present in
// baseline at a less-bad severity/status (per isFindingWorse). This catches
// "you broke an accepted finding back to open" and "you escalated a low
// severity to high" — both of which the user should know about.
// ---------------------------------------------------------------------------

export interface FindingsDelta {
  newFindings: Finding[]
  removedFindings: Finding[]
}

export function computeFindingsDelta(
  baselineFindings: Finding[],
  workingFindings: Finding[],
): FindingsDelta {
  const baselineById = new Map(baselineFindings.map((f) => [f.id, f]))
  const workingIds = new Set(workingFindings.map((f) => f.id))
  const newFindings = workingFindings.filter((f) => {
    const before = baselineById.get(f.id)
    return before === undefined || isFindingWorse(before, f)
  })
  const removedFindings = baselineFindings.filter((f) => !workingIds.has(f.id))
  return { newFindings, removedFindings }
}

// ---------------------------------------------------------------------------
// Graph delta — "what nodes/edges exist now that didn't before, or vice versa?"
//
// Pure id-set diff. No semantic comparison of node/edge content; if you
// re-emit the same id with different metadata, that's not flagged here.
// ---------------------------------------------------------------------------

export interface GraphDelta {
  newNodes: Node[]
  removedNodes: Node[]
  newEdges: Edge[]
  removedEdges: Edge[]
}

/**
 * Keep only graph changes connected to the files affected by the
 * current diff. validate_diff performs a full in-memory rescan, so the raw
 * baseline delta may also contain weeks of unrelated repository drift. That
 * drift belongs in validate_drift, not in every post-edit response.
 *
 * Nodes directly affected by the diff are retained, as are endpoints of a
 * retained edge. Derived subsystem dependencies are retained only when a
 * changed file-level import collapses to that exact subsystem pair. Merely
 * sharing an owning subsystem is not enough: otherwise stale changes in a
 * sibling file of a large subsystem would leak into the task result.
 */
export function scopeGraphDelta(
  delta: GraphDelta,
  affectedNodeIds: Set<string>,
  ownershipEdges: Edge[],
): GraphDelta {
  const affectedFileIds = new Set([...affectedNodeIds].filter((id) => id.startsWith('file:')))
  const isDirectlyAffectedEdge = (edge: Edge) =>
    affectedFileIds.has(edge.from) || affectedFileIds.has(edge.to)

  const fileOwners = new Map<string, string>()
  for (const edge of ownershipEdges) {
    if (edge.kind === 'contains' && !fileOwners.has(edge.to)) fileOwners.set(edge.to, edge.from)
  }

  const relatedSubsystemEdgeIds = new Set<string>()
  for (const edge of [...delta.newEdges, ...delta.removedEdges]) {
    if (edge.kind !== 'imports' || !isDirectlyAffectedEdge(edge)) continue
    const fromSubsystem = fileOwners.get(edge.from)
    const toSubsystem = fileOwners.get(edge.to)
    if (fromSubsystem && toSubsystem && fromSubsystem !== toSubsystem) {
      relatedSubsystemEdgeIds.add(`${fromSubsystem}->${toSubsystem}:depends_on`)
    }
  }

  const isAffectedEdge = (edge: Edge) =>
    isDirectlyAffectedEdge(edge) || relatedSubsystemEdgeIds.has(edge.id)

  const newEdges = delta.newEdges.filter(isAffectedEdge)
  const removedEdges = delta.removedEdges.filter(isAffectedEdge)
  const relevantNodeIds = new Set(affectedNodeIds)
  for (const edge of [...newEdges, ...removedEdges]) {
    relevantNodeIds.add(edge.from)
    relevantNodeIds.add(edge.to)
  }

  return {
    newNodes: delta.newNodes.filter((node) => relevantNodeIds.has(node.id)),
    removedNodes: delta.removedNodes.filter((node) => relevantNodeIds.has(node.id)),
    newEdges,
    removedEdges,
  }
}

export function computeGraphDelta(
  baseline: { nodes: Node[]; edges: Edge[] },
  working: { nodes: Node[]; edges: Edge[] },
): GraphDelta {
  const baselineNodeIds = new Set(baseline.nodes.map((n) => n.id))
  const workingNodeIds = new Set(working.nodes.map((n) => n.id))
  const newNodes = working.nodes.filter((n) => !baselineNodeIds.has(n.id))
  const removedNodes = baseline.nodes.filter((n) => !workingNodeIds.has(n.id))

  const baselineEdgeIds = new Set(baseline.edges.map((e) => e.id))
  const workingEdgeIds = new Set(working.edges.map((e) => e.id))
  const newEdges = working.edges.filter((e) => !baselineEdgeIds.has(e.id))
  const removedEdges = baseline.edges.filter((e) => !workingEdgeIds.has(e.id))

  return { newNodes, removedNodes, newEdges, removedEdges }
}
