import type { Edge } from '../schema/edge.js'
import type { Evidence } from '../schema/evidence.js'
import type { Finding } from '../schema/finding.js'
import type { Node } from '../schema/node.js'
import type { Snapshot } from '../schema/snapshot.js'

export interface LoadedSnapshot {
  raw: Snapshot
  nodesById: ReadonlyMap<string, Node>
  /** outgoing edges keyed by `edge.from` */
  edgesByNodeId: ReadonlyMap<string, readonly Edge[]>
  /** incoming edges keyed by `edge.to` — primary input for blast radius */
  edgesByTargetId: ReadonlyMap<string, readonly Edge[]>
  evidenceById: ReadonlyMap<string, Evidence>
  /** findings keyed by every node in `involvedNodeIds` */
  findingsByNodeId: ReadonlyMap<string, readonly Finding[]>
}

export function buildLoadedSnapshot(snap: Snapshot): LoadedSnapshot {
  const nodesById = new Map<string, Node>()
  for (const n of snap.nodes) nodesById.set(n.id, n)

  const edgesByNodeId = new Map<string, Edge[]>()
  const edgesByTargetId = new Map<string, Edge[]>()
  for (const e of snap.edges) {
    pushIntoMap(edgesByNodeId, e.from, e)
    pushIntoMap(edgesByTargetId, e.to, e)
  }

  const evidenceById = new Map<string, Evidence>()
  for (const ev of snap.evidence) evidenceById.set(ev.id, ev)

  const findingsByNodeId = new Map<string, Finding[]>()
  for (const f of snap.findings) {
    for (const nodeId of f.involvedNodeIds) {
      pushIntoMap(findingsByNodeId, nodeId, f)
    }
  }

  return {
    raw: snap,
    nodesById,
    edgesByNodeId,
    edgesByTargetId,
    evidenceById,
    findingsByNodeId,
  }
}

function pushIntoMap<K, V>(map: Map<K, V[]>, key: K, value: V): void {
  const existing = map.get(key)
  if (existing) {
    existing.push(value)
  } else {
    map.set(key, [value])
  }
}
