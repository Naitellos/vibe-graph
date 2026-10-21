import { isRuntimeCouplingEdge } from '../graph/edge-categories.js'
import type { FindingDomain } from '../schema/common.js'
import type { Finding } from '../schema/finding.js'
import type { Detector, DetectorContext } from './types.js'

// ── Detector ──────────────────────────────────────────────────────────────────

export const coreOrphansDetector: Detector = {
  id: 'core/orphans',
  description: 'flags subsystems with no incoming or outgoing dependency edges',
  domain: 'architecture' as FindingDomain,

  async run(ctx: DetectorContext): Promise<Finding[]> {
    const { snapshot } = ctx
    const findings: Finding[] = []

    for (const [nodeId, node] of snapshot.nodesById) {
      if (node.kind !== 'subsystem') continue

      // Count outgoing dependency edges where target is also a subsystem
      const outgoing = snapshot.edgesByNodeId.get(nodeId) ?? []
      let outDegree = 0
      for (const edge of outgoing) {
        if (!isRuntimeCouplingEdge(edge)) continue
        const target = snapshot.nodesById.get(edge.to)
        if (target === undefined || target.kind !== 'subsystem') continue
        outDegree++
      }

      // Count incoming dependency edges where source is also a subsystem
      const incoming = snapshot.edgesByTargetId.get(nodeId) ?? []
      let inDegree = 0
      for (const edge of incoming) {
        if (!isRuntimeCouplingEdge(edge)) continue
        const source = snapshot.nodesById.get(edge.from)
        if (source === undefined || source.kind !== 'subsystem') continue
        inDegree++
      }

      // Orphan: no subsystem-to-subsystem dep edges in either direction
      if (outDegree === 0 && inDegree === 0) {
        const title = node.title ?? nodeId

        const finding: Finding = {
          id: `fnd:core/orphans:${nodeId}`,
          domain: 'architecture' as const,
          type: 'orphan' as const,
          detectorId: 'core/orphans' as const,
          severity: 'low' as const,
          title: `Orphan subsystem: ${title}`,
          summary: `Subsystem ${title} has no dependencies on other subsystems and no other subsystem depends on it. Consider whether it's dead code, a tool, or genuinely standalone.`,
          involvedNodeIds: [nodeId],
          evidenceIds: [],
          status: 'open',
          metadata: {},
        }

        findings.push(finding)
      }
    }

    return findings
  },
}
