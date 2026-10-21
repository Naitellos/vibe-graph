import type { ValidateDiffUiPayload } from '@codearch/core'

export interface DiffSets {
  addedEdges: { from: string; to: string }[]
  removedEdges: { from: string; to: string }[]
  addedNodeIds: Set<string>
  changedNodeIds: Set<string>
  violationNodeIds: Set<string>
  blastBadges: Map<string, string>
  summary: {
    status: string
    addedEdgeCount: number
    removedEdgeCount: number
    newViolationCount: number
    removedViolationCount: number
    resolvedFindingCount: number
    removedNodeIds: string[]
  }
}

export function deltaToDiffSets(p: ValidateDiffUiPayload, present: Set<string>): DiffSets {
  const bothPresent = (e: { from: string; to: string }) => present.has(e.from) && present.has(e.to)
  const addedEdges = p.edges.added.filter(bothPresent).map((e) => ({ from: e.from, to: e.to }))
  const removedEdges = p.edges.removed.filter(bothPresent).map((e) => ({ from: e.from, to: e.to }))
  const addedNodeIds = new Set(p.nodes.added.map((n) => n.id).filter((id) => present.has(id)))
  const violationNodeIds = new Set(
    p.violations.added.flatMap((v) => v.involvedNodeIds).filter((id) => present.has(id)),
  )
  const blastBadges = new Map<string, string>()
  const changedNodeIds = new Set<string>()
  for (const e of [...addedEdges, ...removedEdges]) {
    changedNodeIds.add(e.from)
    changedNodeIds.add(e.to)
  }
  for (const b of p.blastRadius) {
    if (b.delta !== '0' && present.has(b.id)) {
      blastBadges.set(b.id, b.delta)
      changedNodeIds.add(b.id)
    }
  }
  for (const id of violationNodeIds) changedNodeIds.add(id)
  for (const id of p.findings.added.flatMap((f) => f.involvedNodeIds))
    if (present.has(id)) changedNodeIds.add(id)
  return {
    addedEdges,
    removedEdges,
    addedNodeIds,
    changedNodeIds,
    violationNodeIds,
    blastBadges,
    summary: {
      status: p.status,
      addedEdgeCount: addedEdges.length,
      removedEdgeCount: removedEdges.length,
      newViolationCount: p.counts.newViolations,
      removedViolationCount: p.counts.removedViolations,
      resolvedFindingCount: p.counts.resolvedFindings,
      removedNodeIds: p.nodes.removed.map((n) => n.id),
    },
  }
}

/** Single data-diff-kind for a node; precedence violation > added > changed. */
export function nodeDiffKind(
  id: string,
  s: DiffSets,
): 'violation' | 'added' | 'changed' | undefined {
  if (s.violationNodeIds.has(id)) return 'violation'
  if (s.addedNodeIds.has(id)) return 'added'
  if (s.changedNodeIds.has(id)) return 'changed'
  return undefined
}
