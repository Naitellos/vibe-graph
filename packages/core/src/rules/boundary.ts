import { isRuntimeCouplingEdge } from '../graph/edge-categories.js'
import type { Finding } from '../schema/finding.js'
import type { Rule } from '../schema/rule.js'
import type { RuleEvaluatorContext } from './engine.js'

// ── Type alias ────────────────────────────────────────────────────────────────

export type BoundaryRule = Extract<Rule, { kind: 'boundary' }>

// ── Pure evaluator ────────────────────────────────────────────────────────────

/**
 * Evaluates a `boundary` rule against the working snapshot.
 *
 * Semantics: only subsystems listed in `rule.allowedFrom` are permitted to
 * access `rule.protectedSubsystem`. All other subsystems that have an edge
 * targeting the protected subsystem emit a Finding.
 *
 * Non-subsystem from-edges (e.g. file→subsystem) are skipped — boundary rules
 * operate at the subsystem-to-subsystem level only.
 */
export function evaluateBoundary(rule: BoundaryRule, ctx: RuleEvaluatorContext): Finding[] {
  const { snapshot } = ctx

  const protectedSubsysNodeId = `subsystem:${rule.protectedSubsystem}`
  const allowedFromIds = new Set(rule.allowedFrom.map((s) => `subsystem:${s}`))

  // Look up the protected subsystem's title for use in finding messages
  const protectedNode = snapshot.nodesById.get(protectedSubsysNodeId)
  const protectedTitle = protectedNode?.title ?? protectedSubsysNodeId

  const incomingEdges = snapshot.edgesByTargetId.get(protectedSubsysNodeId) ?? []
  const findings: Finding[] = []

  for (const edge of incomingEdges) {
    // Type-only edges (import type) are not runtime coupling — not a boundary violation.
    if (!isRuntimeCouplingEdge(edge)) continue

    // Skip non-subsystem from-edges (file→subsystem, package→subsystem, etc.)
    const fromNode = snapshot.nodesById.get(edge.from)
    if (!fromNode || fromNode.kind !== 'subsystem') continue

    // If the from subsystem is in the allow-list, it's permitted
    if (allowedFromIds.has(edge.from)) continue

    // Boundary violation — emit a Finding
    const fromTitle = fromNode.title

    const finding: Finding = {
      id: `rule:${rule.id}:${edge.from}->${edge.to}`,
      domain: 'rule',
      type: 'rule-violation',
      detectorId: 'rules-engine',
      severity: rule.severity,
      title: `Boundary violation (${rule.id}): ${fromTitle} accesses ${protectedTitle}`,
      summary: `Subsystem ${edge.from} is not permitted to access ${protectedSubsysNodeId}.`,
      status: 'open',
      involvedNodeIds: [edge.from, edge.to],
      evidenceIds: [...edge.evidenceIds],
      metadata: { ruleId: rule.id, mode: rule.mode, edgeId: edge.id },
    }

    findings.push(finding)
  }

  return findings
}
