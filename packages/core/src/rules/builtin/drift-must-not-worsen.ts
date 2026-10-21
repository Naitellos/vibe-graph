import type { Finding } from '../../schema/finding.js'
import type { BuiltinRule, BuiltinRuleContext } from './no-new-cycles.js'

// ── Pure evaluator ────────────────────────────────────────────────────────────

/**
 * Evaluates the `drift_must_not_worsen` builtin rule.
 *
 * Emits one Finding(domain='rule') per drift finding present in the working
 * snapshot that was NOT present in the baseline (identified by id). If baseline
 * is null (first scan) this is a no-op by design — there is no reference to
 * compare against.
 *
 * Each emitted finding references the underlying drift finding via
 * `metadata.driftFindingId` so callers can correlate the rule violation back to
 * the drift detector output.
 */
export function evaluateDriftMustNotWorsen(rule: BuiltinRule, ctx: BuiltinRuleContext): Finding[] {
  const { snapshot, baseline } = ctx

  // No baseline → first scan; rule is no-op (nothing to compare against)
  if (baseline === null) {
    return []
  }

  // Collect ids of drift findings already known in baseline
  const baselineDriftIds = new Set(
    baseline.findings.filter((f) => f.domain === 'drift').map((f) => f.id),
  )

  const findings: Finding[] = []

  for (const driftFinding of snapshot.raw.findings) {
    if (driftFinding.domain !== 'drift') continue
    // If this drift finding already existed in baseline, it's not new
    if (baselineDriftIds.has(driftFinding.id)) continue

    const finding: Finding = {
      id: `rule:${rule.id}:${driftFinding.id}`,
      domain: 'rule',
      type: 'rule-violation',
      detectorId: 'rules-engine',
      severity: rule.severity,
      title: `Drift worsened (${rule.id}): ${driftFinding.title}`,
      summary: `New drift finding since baseline: ${driftFinding.title}`,
      status: 'open',
      involvedNodeIds: [...driftFinding.involvedNodeIds],
      evidenceIds: [],
      metadata: {
        ruleId: rule.id,
        mode: rule.mode,
        driftFindingId: driftFinding.id,
      },
    }

    findings.push(finding)
  }

  return findings
}
