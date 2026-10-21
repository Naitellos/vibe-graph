import { isRuntimeCouplingEdge } from '../graph/edge-categories.js'
import type { FindingDomain } from '../schema/common.js'
import type { Finding } from '../schema/finding.js'
import type { Detector, DetectorContext } from './types.js'

// ── Constants ─────────────────────────────────────────────────────────────────

/**
 * Default fan-out threshold per spec §5.4.
 * TODO: read from snapshot config once LoadedSnapshot carries config.
 */
const DEFAULT_FAN_OUT_THRESHOLD = 6

/**
 * Subsystems in the top N% by out-degree get severity 'high'; others get 'medium'.
 * Per spec §5.4: top 15% for fan-out.
 */
const HIGH_SEVERITY_TOP_PERCENTILE = 15

// ── Helpers ───────────────────────────────────────────────────────────────────

/**
 * Returns true if `myDegree` is within the top `percent`% of `allDegrees` (descending order).
 * Uses >= comparison so ties at the cutoff boundary both get 'high'.
 */
function isInTopPercentile(myDegree: number, allDegrees: number[], percent: number): boolean {
  if (allDegrees.length === 0) return false
  const sorted = [...allDegrees].sort((a, b) => b - a) // descending
  const cutoffIndex = Math.max(0, Math.ceil((sorted.length * percent) / 100) - 1)
  const cutoff = sorted[cutoffIndex]
  return cutoff !== undefined && myDegree >= cutoff
}

// ── Detector ──────────────────────────────────────────────────────────────────

export const coreFanOutDetector: Detector = {
  id: 'core/fan-out',
  description: 'flags subsystems with high outgoing dependency degree',
  domain: 'architecture' as FindingDomain,

  async run(ctx: DetectorContext): Promise<Finding[]> {
    const { snapshot } = ctx
    const threshold = DEFAULT_FAN_OUT_THRESHOLD

    // Step 1: compute out-degree for each subsystem node
    // Only count outgoing dependency edges where the target is also a subsystem.
    const outDegreeByNodeId = new Map<string, number>()

    for (const [nodeId, node] of snapshot.nodesById) {
      if (node.kind !== 'subsystem') continue

      const outgoing = snapshot.edgesByNodeId.get(nodeId) ?? []
      let degree = 0
      for (const edge of outgoing) {
        if (!isRuntimeCouplingEdge(edge)) continue
        const target = snapshot.nodesById.get(edge.to)
        if (target === undefined || target.kind !== 'subsystem') continue
        degree++
      }

      outDegreeByNodeId.set(nodeId, degree)
    }

    // Step 2: collect all positive degrees for percentile computation
    const allDegrees: number[] = []
    for (const degree of outDegreeByNodeId.values()) {
      if (degree > 0) allDegrees.push(degree)
    }

    // Step 3: emit findings for subsystems at or above threshold
    const findings: Finding[] = []

    for (const [nodeId, degree] of outDegreeByNodeId) {
      if (degree < threshold) continue

      const node = snapshot.nodesById.get(nodeId)
      const title = node?.title ?? nodeId

      const severity = isInTopPercentile(degree, allDegrees, HIGH_SEVERITY_TOP_PERCENTILE)
        ? ('high' as const)
        : ('medium' as const)

      const finding: Finding = {
        id: `fnd:core/fan-out:${nodeId}`,
        domain: 'architecture' as const,
        type: 'high-fan-out' as const,
        detectorId: 'core/fan-out' as const,
        severity,
        title: `High fan-out: ${title} depends on ${degree} subsystems`,
        summary: `Subsystem ${title} has ${degree} outgoing dependencies (threshold: ${threshold}). Consider splitting responsibilities.`,
        involvedNodeIds: [nodeId],
        evidenceIds: [],
        status: 'open',
        metadata: {},
      }

      findings.push(finding)
    }

    return findings
  },
}
