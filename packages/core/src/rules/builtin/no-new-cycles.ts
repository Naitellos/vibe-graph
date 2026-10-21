import { findSubsystemCycles } from '../../detectors/core-cycles.js'
import type { Finding } from '../../schema/finding.js'
import type { GraphBaseline } from '../../schema/graph-baseline.js'
import type { Rule } from '../../schema/rule.js'
import type { Snapshot } from '../../schema/snapshot.js'
import { buildLoadedSnapshot } from '../../snapshot/load-snapshot.js'
import type { LoadedSnapshot } from '../../snapshot/load-snapshot.js'

// ── Context ───────────────────────────────────────────────────────────────────

export interface BuiltinRuleContext {
  snapshot: LoadedSnapshot
  baseline: GraphBaseline | null
}

// ── Pure evaluator ────────────────────────────────────────────────────────────

/**
 * Evaluates the `no_cycles` builtin rule.
 *
 * Emits one Finding(domain='rule') per cycle present in the working snapshot
 * that was not present in the baseline. If baseline is null (first scan) this
 * is a no-op by design — there is no reference to compare against.
 *
 * Cycle identity is the sorted subsystem-id comma-joined string, matching the
 * scheme used by the `core/cycles` detector (`fnd:core/cycles:<sig>`).
 */
// The builtin variant — all builtin rules share the same structural shape;
// the `check` field discriminates which rule is active at runtime.
export type BuiltinRule = Extract<Rule, { kind: 'builtin' }>

export function evaluateNoNewCycles(rule: BuiltinRule, ctx: BuiltinRuleContext): Finding[] {
  const { snapshot, baseline } = ctx

  // No baseline → first scan; rule is no-op (nothing to compare against)
  if (baseline === null) {
    return []
  }

  // Build a LoadedSnapshot from the baseline so we can run the same cycle finder
  const baselineSnap: Snapshot = {
    meta: {
      schemaVersion: '0.1.0',
      // ephemeral snapshot built for cycle/orphan diff — never persisted or validated
      scanId: '00000000-0000-0000-0000-000000000000',
      builtAt: baseline.createdAt,
      projectRoot: '/',
      projectName: 'baseline',
      vibegraphVersion: '0.0.0',
      scanDurationMs: 0,
      fileCounts: { scanned: 0, indexed: 0, skipped: 0 },
    },
    nodes: baseline.nodes,
    edges: baseline.edges,
    evidence: [],
    findings: baseline.findings,
  }
  const baselineLoaded = buildLoadedSnapshot(baselineSnap)

  // Compute cycle signatures for working snapshot and baseline
  const workingCycles = findSubsystemCycles(snapshot)
  const baselineCycles = findSubsystemCycles(baselineLoaded)

  const baselineSigs = new Set(baselineCycles.map((c) => c.join(',')))

  const findings: Finding[] = []

  for (const cycle of workingCycles) {
    const sig = cycle.join(',')
    if (baselineSigs.has(sig)) continue // cycle already existed → not new

    const nodeLabels = cycle.map((id) => snapshot.nodesById.get(id)?.title ?? id)
    const cycleLabel = [...nodeLabels, nodeLabels[0]].join(' → ')

    const finding: Finding = {
      id: `rule:${rule.id}:${sig}`,
      domain: 'rule',
      type: 'rule-violation',
      detectorId: 'rules-engine',
      severity: rule.severity,
      title: `New cycle (${rule.id}): ${cycleLabel}`,
      summary: `A new dependency cycle was introduced involving ${cycle.length} subsystem${cycle.length === 1 ? '' : 's'}: ${nodeLabels.join(', ')}. Break the cycle to keep the architecture acyclic.`,
      status: 'open',
      involvedNodeIds: cycle,
      evidenceIds: [],
      metadata: { ruleId: rule.id, mode: rule.mode },
    }

    findings.push(finding)
  }

  return findings
}
