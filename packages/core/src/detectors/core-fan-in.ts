import { isRuntimeCouplingEdge } from '../graph/edge-categories.js'
import type { FindingDomain } from '../schema/common.js'
import type { Finding } from '../schema/finding.js'
import type { Detector, DetectorContext } from './types.js'

// ── Constants ─────────────────────────────────────────────────────────────────

/**
 * Default fan-in threshold per spec §5.4.
 * TODO: read from snapshot config once LoadedSnapshot carries config.
 */
const DEFAULT_FAN_IN_THRESHOLD = 8

/**
 * Subsystems in the top N% by in-degree get severity 'high'; others get 'medium'.
 * Per spec §5.4: top 10% for fan-in.
 */
const HIGH_SEVERITY_TOP_PERCENTILE = 10

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

export const coreFanInDetector: Detector = {
  id: 'core/fan-in',
  description: 'flags subsystems with high incoming dependency degree',
  domain: 'architecture' as FindingDomain,

  async run(ctx: DetectorContext): Promise<Finding[]> {
    const { snapshot } = ctx
    const threshold = DEFAULT_FAN_IN_THRESHOLD

    // Step 1: compute in-degree for each subsystem node
    // Only count incoming dependency edges where the source is also a subsystem.
    const inDegreeByNodeId = new Map<string, number>()

    for (const [nodeId, node] of snapshot.nodesById) {
      if (node.kind !== 'subsystem') continue

      const incoming = snapshot.edgesByTargetId.get(nodeId) ?? []
      let degree = 0
      for (const edge of incoming) {
        if (!isRuntimeCouplingEdge(edge)) continue
        const source = snapshot.nodesById.get(edge.from)
        if (source === undefined || source.kind !== 'subsystem') continue
        degree++
      }

      inDegreeByNodeId.set(nodeId, degree)
    }

    // Step 2: collect all positive degrees for percentile computation
    const allDegrees: number[] = []
    for (const degree of inDegreeByNodeId.values()) {
      if (degree > 0) allDegrees.push(degree)
    }

    // Step 3: emit findings for subsystems at or above threshold
    const findings: Finding[] = []

    for (const [nodeId, degree] of inDegreeByNodeId) {
      if (degree < threshold) continue

      const node = snapshot.nodesById.get(nodeId)
      const title = node?.title ?? nodeId

      const severity = isInTopPercentile(degree, allDegrees, HIGH_SEVERITY_TOP_PERCENTILE)
        ? ('high' as const)
        : ('medium' as const)

      const finding: Finding = {
        id: `fnd:core/fan-in:${nodeId}`,
        domain: 'architecture' as const,
        type: 'high-fan-in' as const,
        detectorId: 'core/fan-in' as const,
        severity,
        title: `High fan-in: ${title} is depended on by ${degree} subsystems`,
        summary: `Subsystem ${title} has ${degree} incoming dependencies (threshold: ${threshold}). Consider extracting a shared abstraction.`,
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
