// packages/core/src/overview/build-overview.ts

import { isRuntimeCouplingEdge } from '../graph/edge-categories.js'
import type { LoadedSnapshot } from '../snapshot/load-snapshot.js'

export interface ProjectOverview {
  project: { name: string; root: string; snapshotBuiltAt: string; snapshotScanId: string }
  counts: {
    subsystems: number
    files: number
    edges: number
    findings: number
    externalPackages: number
  }
  layers: Array<{ layer: string; nodeCount: number }>
  /** Layer distribution over SUBSYSTEM nodes only (file nodes excluded). */
  subsystemLayers: Array<{ layer: string; subsystemCount: number }>
  /** True if any subsystem was auto-detected (heuristic) → first-run nudges curation. */
  autoDetected: boolean
  topFindings: Array<{
    id: string
    type: string
    severity: string
    title: string
    involvedNodeIds: string[]
    location?: { file: string; line?: number }
  }>
  topHubs: Array<{ nodeId: string; title: string; fanIn: number; fanOut: number }>
}

/** Pure function — exported for direct testing without a reader. */
export function buildOverview(loaded: LoadedSnapshot): ProjectOverview {
  const snap = loaded.raw

  // counts
  const counts = {
    subsystems: snap.nodes.filter((n) => n.kind === 'subsystem').length,
    files: snap.nodes.filter((n) => n.kind === 'file').length,
    edges: snap.edges.length,
    findings: snap.findings.length,
    externalPackages: snap.nodes.filter((n) => n.kind === 'external').length,
  }

  // layers — group all nodes by their .layer field, sorted alpha for determinism
  const layerCounts = new Map<string, number>()
  for (const n of snap.nodes) {
    layerCounts.set(n.layer, (layerCounts.get(n.layer) ?? 0) + 1)
  }
  const layers = [...layerCounts.entries()]
    .map(([layer, nodeCount]) => ({ layer, nodeCount }))
    .sort((a, b) => a.layer.localeCompare(b.layer))

  // topFindings — top 5 by severity (high > medium > low), tie-broken by id alpha
  const severityRank: Record<string, number> = { high: 0, medium: 1, low: 2 }
  const topFindings = [...snap.findings]
    .sort((a, b) => {
      const rs = (severityRank[a.severity] ?? 99) - (severityRank[b.severity] ?? 99)
      if (rs !== 0) return rs
      return a.id.localeCompare(b.id)
    })
    .slice(0, 5)
    .map((f) => {
      const ev = f.evidenceIds.map((id) => loaded.evidenceById.get(id)).find((e) => e !== undefined)
      return {
        id: f.id,
        type: f.type,
        severity: f.severity,
        title: f.title,
        involvedNodeIds: f.involvedNodeIds,
        ...(ev
          ? {
              location:
                ev.line !== undefined ? { file: ev.file, line: ev.line } : { file: ev.file },
            }
          : {}),
      }
    })

  // topHubs — top 3 subsystem nodes by combined (fanIn + fanOut), tie-broken by nodeId alpha
  // Only subsystem→subsystem runtime-coupling edges count toward hub degree.
  const subsystemNodes = snap.nodes.filter((n) => n.kind === 'subsystem')

  // subsystemLayers — layer distribution over SUBSYSTEM nodes only (excludes file/external noise)
  const subsystemLayerCounts = new Map<string, number>()
  for (const n of subsystemNodes) {
    subsystemLayerCounts.set(n.layer, (subsystemLayerCounts.get(n.layer) ?? 0) + 1)
  }
  const subsystemLayers = [...subsystemLayerCounts.entries()]
    .map(([layer, subsystemCount]) => ({ layer, subsystemCount }))
    .sort((a, b) => a.layer.localeCompare(b.layer))
  const autoDetected = subsystemNodes.some((n) => n.metadata.autoDetected === true)
  const hubs = subsystemNodes.map((n) => {
    const incoming = (loaded.edgesByTargetId.get(n.id) ?? []).filter((e) => {
      if (!isRuntimeCouplingEdge(e)) return false
      const src = loaded.nodesById.get(e.from)
      return src?.kind === 'subsystem'
    }).length
    const outgoing = (loaded.edgesByNodeId.get(n.id) ?? []).filter((e) => {
      if (!isRuntimeCouplingEdge(e)) return false
      const dst = loaded.nodesById.get(e.to)
      return dst?.kind === 'subsystem'
    }).length
    return {
      nodeId: n.id,
      title: n.title,
      fanIn: incoming,
      fanOut: outgoing,
      combined: incoming + outgoing,
    }
  })
  const topHubs = hubs
    .sort((a, b) => {
      if (b.combined !== a.combined) return b.combined - a.combined
      return a.nodeId.localeCompare(b.nodeId)
    })
    .slice(0, 3)
    .map(({ nodeId, title, fanIn, fanOut }) => ({ nodeId, title, fanIn, fanOut }))

  return {
    project: {
      name: snap.meta.projectName,
      root: snap.meta.projectRoot,
      snapshotBuiltAt: snap.meta.builtAt,
      snapshotScanId: snap.meta.scanId,
    },
    counts,
    layers,
    subsystemLayers,
    autoDetected,
    topFindings,
    topHubs,
  }
}
