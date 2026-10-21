import { isRuntimeCouplingEdge } from '../graph/edge-categories.js'
import type { FindingDomain } from '../schema/common.js'
import type { Finding } from '../schema/finding.js'
import type { LoadedSnapshot } from '../snapshot/load-snapshot.js'
import type { Detector, DetectorContext } from './types.js'

// ── Tarjan SCC ────────────────────────────────────────────────────────────────

function tarjanScc(adj: Map<string, Set<string>>): string[][] {
  let index = 0
  const stack: string[] = []
  const onStack = new Set<string>()
  const indices = new Map<string, number>()
  const lowlinks = new Map<string, number>()
  const sccs: string[][] = []

  function strongconnect(v: string): void {
    indices.set(v, index)
    lowlinks.set(v, index)
    index++
    stack.push(v)
    onStack.add(v)

    for (const w of adj.get(v) ?? new Set<string>()) {
      if (!indices.has(w)) {
        strongconnect(w)
        const vLow = lowlinks.get(v) ?? 0
        const wLow = lowlinks.get(w) ?? 0
        lowlinks.set(v, Math.min(vLow, wLow))
      } else if (onStack.has(w)) {
        const vLow = lowlinks.get(v) ?? 0
        const wIdx = indices.get(w) ?? 0
        lowlinks.set(v, Math.min(vLow, wIdx))
      }
    }

    if (lowlinks.get(v) === indices.get(v)) {
      const scc: string[] = []
      let w: string | undefined
      do {
        w = stack.pop()
        if (w === undefined) break
        onStack.delete(w)
        scc.push(w)
      } while (w !== v)
      sccs.push(scc)
    }
  }

  for (const v of adj.keys()) {
    if (!indices.has(v)) strongconnect(v)
  }

  return sccs
}

// ── Pure helper: find all cycle SCCs in a loaded snapshot ─────────────────────
//
// Returns each cycle as a sorted array of subsystem node ids.
// Cycle signature = sorted-ids.join(',') — stable across snapshot versions.
// Used by the core/cycles detector and by the builtin no-new-cycles rule.

export function findSubsystemCycles(snapshot: LoadedSnapshot): string[][] {
  // Build adjacency list: subsystem → subsystem, dependency edges only
  const adj = new Map<string, Set<string>>()

  for (const [nodeId, node] of snapshot.nodesById) {
    if (node.kind !== 'subsystem') continue
    if (!adj.has(nodeId)) {
      adj.set(nodeId, new Set<string>())
    }

    const outgoing = snapshot.edgesByNodeId.get(nodeId) ?? []
    for (const edge of outgoing) {
      if (!isRuntimeCouplingEdge(edge)) continue
      const target = snapshot.nodesById.get(edge.to)
      if (target === undefined || target.kind !== 'subsystem') continue
      // adj.set(nodeId, new Set()) above guarantees this entry exists
      adj.get(nodeId)?.add(edge.to)
    }
  }

  const sccs = tarjanScc(adj)

  const cycles: string[][] = []
  for (const scc of sccs) {
    const isCycle =
      scc.length >= 2 ||
      (scc.length === 1 &&
        scc[0] !== undefined &&
        (adj.get(scc[0]) ?? new Set<string>()).has(scc[0]))

    if (!isCycle) continue

    cycles.push(scc.slice().sort())
  }

  return cycles
}

// ── Detector ──────────────────────────────────────────────────────────────────

export const coreCyclesDetector: Detector = {
  id: 'core/cycles',
  description: 'detects cycles in subsystem dependency graph via Tarjan SCC',
  domain: 'architecture' as FindingDomain,

  async run(ctx: DetectorContext): Promise<Finding[]> {
    const { snapshot } = ctx

    const cycles = findSubsystemCycles(snapshot)
    const findings: Finding[] = []

    for (const sorted of cycles) {
      // Gather human-readable titles for sorted node ids
      const titles = sorted.map((id) => snapshot.nodesById.get(id)?.title ?? id)

      const finding: Finding = {
        id: `fnd:core/cycles:${sorted.join(',')}`,
        domain: 'architecture' as const,
        type: 'cycle' as const,
        detectorId: 'core/cycles' as const,
        severity: 'high' as const,
        title: `Cyclic dependency: ${titles.join(' ↔ ')}`,
        summary: `SCC of size ${sorted.length}: ${sorted.length} subsystem${sorted.length === 1 ? '' : 's'} form a dependency cycle. Refactor to break the cycle.`,
        involvedNodeIds: sorted,
        evidenceIds: [],
        status: 'open',
        metadata: {},
      }

      findings.push(finding)
    }

    return findings
  },
}
