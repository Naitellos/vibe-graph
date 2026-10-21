import type { NodeMatcher, Rule } from '../schema/rule.js'

// ---------------------------------------------------------------------------
// Rule applicability — determines which rules surface in prepare_task output
// ---------------------------------------------------------------------------

/**
 * Returns true when the rule is relevant to the given target subsystem set.
 *
 * - builtin: globally applicable (fires on any change, not subsystem-specific)
 * - edge-pattern: applicable when either side's subsystem (if specified) is in
 *   targets, OR when a side uses only layer/exclude_subsystem matchers (which
 *   could match any subsystem, so always applicable)
 * - boundary: globally applicable. Any subsystem not in `allowedFrom` is a
 *   potential violator the agent should be warned about pre-edit; if we
 *   filtered by the allow-list, the post-edit `evaluateBoundary` would flag
 *   the violation while prepare_task gave no preflight warning — breaking
 *   the preflight contract. See: forbidden-source-not-surfaced fix.
 */
export function isRuleApplicableToSubsystems(rule: Rule, targetSubsystemIds: Set<string>): boolean {
  if (rule.kind === 'builtin') return true

  if (rule.kind === 'edge-pattern') {
    const fromHits = matchesAnyTarget(rule.from, targetSubsystemIds)
    const toHits = matchesAnyTarget(rule.to, targetSubsystemIds)
    return fromHits || toHits
  }

  if (rule.kind === 'boundary') {
    // Globally applicable — every potential source needs to know the constraint
    // before editing. The targetSubsystemIds parameter is currently unused for
    // boundary rules but kept in the signature for future scoping if needed.
    void targetSubsystemIds
    return true
  }

  return false
}

/**
 * Returns true when the NodeMatcher could match one of the target subsystems.
 * If matcher specifies a particular subsystem, that subsystem must be in targets.
 * Layer-only or exclude_subsystem-only matchers are globally applicable.
 */
function matchesAnyTarget(matcher: NodeMatcher, targetSubsystemIds: Set<string>): boolean {
  if (matcher.subsystem !== undefined) {
    return targetSubsystemIds.has(`subsystem:${matcher.subsystem}`)
  }
  // layer-only or exclude_subsystem-only: globally applicable
  return true
}

// ---------------------------------------------------------------------------
// Forbidding rules — determines which rules contribute to doNotDo
// ---------------------------------------------------------------------------

/**
 * Returns true when violating this rule means you did something you shouldn't.
 * builtin no_cycles is informational ("do not introduce") but per spec is NOT
 * included in the doNotDo list.
 */
export function isForbiddingRule(rule: Rule): boolean {
  if (rule.kind === 'edge-pattern') return rule.forbidden
  if (rule.kind === 'boundary') return true // always forbidding (except for allowedFrom)
  if (rule.kind === 'builtin') {
    return rule.check === 'no_orphans' || rule.check === 'drift_must_not_worsen'
  }
  return false
}

// ---------------------------------------------------------------------------
// Formatting helpers
// ---------------------------------------------------------------------------

/**
 * Fallback title for builtin rules whose .title field is empty.
 * Currently all 4 DEFAULT_BUILTIN_RULES have titles set, but defensive fallback.
 */
export function humanizeBuiltinTitle(rule: Extract<Rule, { kind: 'builtin' }>): string {
  switch (rule.check) {
    case 'no_cycles':
      return 'No new architectural cycles'
    case 'no_orphans':
      return 'New files must belong to a subsystem'
    case 'drift_must_not_worsen':
      return 'Drift count must not increase'
  }
}

// Map RuleSchema relations to a grammatically-correct imperative verb phrase.
// Pre-fix this was `rule.relation.replace('_', ' ')` which produced
// "depends on" (3rd person singular) where the imperative needed "depend on".
const RELATION_IMPERATIVE: Record<'imports' | 'depends_on' | 'calls', string> = {
  imports: 'import',
  depends_on: 'depend on',
  calls: 'call',
}

/**
 * Formats a forbidding rule as a plain-English "Do not…" constraint string.
 *
 * Phrasing convention: "Code in <fromMatcher> must not <verb> <toMatcher>".
 * Reads naturally regardless of matcher shape (layer, subsystem, or exclude).
 */
export function formatRuleAsDoNotDo(rule: Rule): string {
  if (rule.kind === 'edge-pattern') {
    const fromDesc = formatMatcher(rule.from)
    const toDesc = formatMatcher(rule.to)
    const verb = RELATION_IMPERATIVE[rule.relation]
    return `Code in ${fromDesc} must not ${verb} ${toDesc} (rule: ${rule.id})`
  }
  if (rule.kind === 'boundary') {
    const allowed = rule.allowedFrom.length > 0 ? rule.allowedFrom.join(', ') : '(no subsystems)'
    return `Do not access subsystem '${rule.protectedSubsystem}' from anywhere except: ${allowed} (rule: ${rule.id})`
  }
  if (rule.kind === 'builtin') {
    switch (rule.check) {
      case 'no_orphans':
        return `Do not add files outside any subsystem.match glob (rule: ${rule.id})`
      case 'drift_must_not_worsen':
        return `Do not introduce new drift findings (rule: ${rule.id})`
      case 'no_cycles':
        return rule.title || rule.id
    }
  }
  // Exhaustive — all union kinds handled above. TypeScript flow analysis may not
  // reach here, but the return satisfies the compiler for non-exhaustive paths.
  const exhaustiveCheck: never = rule
  return (exhaustiveCheck as { id: string }).id
}

function formatMatcher(matcher: NodeMatcher): string {
  const parts: string[] = []
  if (matcher.layer !== undefined) parts.push(`layer=${matcher.layer}`)
  if (matcher.subsystem !== undefined) parts.push(`subsystem=${matcher.subsystem}`)
  if (matcher.exclude_subsystem !== undefined) parts.push(`exclude=${matcher.exclude_subsystem}`)
  return parts.join(', ') || '(any)'
}
