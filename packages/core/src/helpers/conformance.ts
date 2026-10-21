import { isRuntimeCouplingEdge } from '../graph/edge-categories.js'
import type { Conformance } from '../schema/diff-validation.js'
import type { Finding } from '../schema/finding.js'
import type { GraphDelta } from './delta.js'

const isSubsystem = (id: string): boolean => id.startsWith('subsystem:')
const label = (id: string): string => id.replace(/^subsystem:/, '')

/**
 * Derive synthetic `new-coupling` findings from a graph delta: a NEW
 * subsystem→subsystem runtime-coupling edge that touches an affected subsystem.
 * Intent-free (works in both auto and curated mode) and type-only-safe (shared
 * contracts via `import type` are NOT coupling — see isRuntimeCouplingEdge).
 *
 * Coupling is determined SOLELY by `isRuntimeCouplingEdge`: type-only edges are
 * structurally excluded here. `undeclared` drift findings are NOT coupling — they
 * may cover type-only edges and must never be counted as cross-subsystem links.
 */
export function collectNewCoupling(
  graphDelta: GraphDelta,
  affectedNodeIds: Set<string>,
): Finding[] {
  const out: Finding[] = []
  for (const e of graphDelta.newEdges) {
    if (!isSubsystem(e.from) || !isSubsystem(e.to)) continue
    if (!isRuntimeCouplingEdge(e)) continue
    if (!affectedNodeIds.has(e.from) && !affectedNodeIds.has(e.to)) continue
    const from = label(e.from)
    const to = label(e.to)
    out.push({
      id: `fnd:core/diff:new-coupling:${e.from}->${e.to}`,
      domain: 'architecture',
      type: 'new-coupling',
      detectorId: 'core/diff',
      severity: 'low',
      title: `New coupling: ${from} → ${to} (areas were independent)`,
      summary: `This change introduced a dependency from ${from} to ${to}; these subsystems did not depend on each other in the baseline.`,
      involvedNodeIds: [e.from, e.to],
      evidenceIds: e.evidenceIds,
      status: 'open',
      metadata: { edgeId: e.id },
    })
  }
  return out
}

const isCycle = (f: Finding): boolean => f.type === 'cycle' || f.title.startsWith('New cycle')
const isOrphan = (f: Finding): boolean => f.type === 'orphan' || f.title.startsWith('Orphan')
const isBoundary = (f: Finding): boolean => f.title.startsWith('Boundary violation')

/** Synthesize the one-line "new mess" headline + counts. Returns undefined when clean. */
export function buildConformance(
  newFindings: Finding[],
  newViolations: Finding[],
): Conformance | undefined {
  const all = [...newViolations, ...newFindings]
  // Dedupe cycles: both the detector finding and the no-new-cycles rule violation share the
  // same involvedNodeIds for the same cycle. Collapse them to a unique set by sorted-ids sig.
  const cycleCount = new Set(
    all.filter(isCycle).map((f) => [...f.involvedNodeIds].sort().join(',')),
  ).size
  // Coupling comes ONLY from `new-coupling` findings — the runtime-only predicate.
  // `undeclared` drift findings must NOT count as coupling: they fire on any new
  // cross-subsystem import including `import type`, which is type-only and NOT
  // a runtime dependency. Counting `undeclared` would produce type-only FPs.
  const coupling = newFindings.filter((f) => f.type === 'new-coupling')
  const boundaries = newViolations.filter(isBoundary)
  const orphans = all.filter(isOrphan)
  const total = cycleCount + coupling.length + boundaries.length + orphans.length
  if (total === 0) return undefined

  const parts: string[] = []
  if (cycleCount) parts.push(`${cycleCount} new cycle${cycleCount === 1 ? '' : 's'}`)
  if (coupling.length) {
    const names = coupling
      .map((f) => f.involvedNodeIds.map((n) => n.replace(/^subsystem:/, '')).join(' → '))
      .join('; ')
    parts.push(
      `${coupling.length} new cross-subsystem link${coupling.length === 1 ? '' : 's'} (${names})`,
    )
  }
  if (boundaries.length)
    parts.push(`${boundaries.length} boundary violation${boundaries.length === 1 ? '' : 's'}`)
  if (orphans.length) parts.push(`${orphans.length} new orphan${orphans.length === 1 ? '' : 's'}`)

  return {
    headline: `This change introduced ${parts.join(' and ')}.`,
    byKind: {
      cycles: cycleCount,
      coupling: coupling.length,
      boundaries: boundaries.length,
      orphans: orphans.length,
    },
  }
}
