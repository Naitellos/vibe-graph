import type { Rule } from '../schema/rule.js'
import type { LoadedSnapshot } from '../snapshot/load-snapshot.js'

/**
 * A rule that references a subsystem id which is absent from the graph.
 *
 * Such a reference is almost always a misconfiguration — a typo, or (the case
 * that surfaced this) a subsystem declared inline in `config.yml` that was
 * silently shadowed by `.vibegraph/subsystems/*.yml` and so never entered the
 * graph. The rule then matches nothing and `check` reports a clean pass — a
 * false green. Surfacing this lets the user distinguish "no violations" from
 * "the rule that would have caught it can never fire".
 */
export interface InertRuleWarning {
  /** Id of the rule that references the unknown subsystem. */
  ruleId: string
  /** The bare subsystem id (no `subsystem:` prefix) not present in the graph. */
  unknownSubsystem: string
  /** Which matcher field referenced it (e.g. `from.subsystem`), for a precise message. */
  field: string
  /**
   * What the unknown reference actually does to the rule:
   * - `inert` — a positive matcher (`from`/`to` `subsystem`, `protectedSubsystem`)
   *   names a subsystem that doesn't exist, so the rule can never fire.
   * - `dead-reference` — an exclusion/allowance (`exclude_subsystem`,
   *   `allowedFrom`) names a subsystem that doesn't exist: the reference never
   *   applies, so the rule fires MORE broadly (edge-pattern) or is STRICTER
   *   (boundary) than intended — the opposite failure mode of inert.
   */
  kind: 'inert' | 'dead-reference'
}

/** Bare subsystem ids (no `subsystem:` prefix) present in the graph. */
function knownSubsystemIds(snapshot: LoadedSnapshot): Set<string> {
  const ids = new Set<string>()
  for (const node of snapshot.nodesById.values()) {
    if (node.kind === 'subsystem') {
      ids.add(node.id.replace(/^subsystem:/, ''))
    }
  }
  return ids
}

/**
 * Detects rules that reference subsystem ids absent from the graph.
 *
 * Covers the two rule kinds that name subsystems:
 * - `edge-pattern` — `from`/`to` `subsystem` and `exclude_subsystem`.
 * - `boundary` — `protectedSubsystem` and each entry of `allowedFrom`.
 *
 * `builtin` rules reference no subsystem ids and are skipped. Returns one
 * warning per (rule, unknown-subsystem) pair, deduped so a subsystem named in
 * several fields of the same rule is reported once (first field wins; positive
 * matchers are checked before exclusions, so `inert` wins the dedupe). Each
 * warning carries a `kind` distinguishing a truly inert rule from a dead
 * exclusion/allowance — the two failure modes point in opposite directions.
 */
export function collectInertRuleWarnings(
  rules: Rule[],
  snapshot: LoadedSnapshot,
): InertRuleWarning[] {
  const known = knownSubsystemIds(snapshot)
  const warnings: InertRuleWarning[] = []
  const seen = new Set<string>()

  const check = (
    ruleId: string,
    field: string,
    subsystemId: string | undefined,
    kind: InertRuleWarning['kind'],
  ): void => {
    if (subsystemId === undefined) return
    if (known.has(subsystemId)) return
    const key = `${ruleId}\u0000${subsystemId}`
    if (seen.has(key)) return
    seen.add(key)
    warnings.push({ ruleId, unknownSubsystem: subsystemId, field, kind })
  }

  for (const rule of rules) {
    switch (rule.kind) {
      case 'edge-pattern':
        check(rule.id, 'from.subsystem', rule.from.subsystem, 'inert')
        check(rule.id, 'from.exclude_subsystem', rule.from.exclude_subsystem, 'dead-reference')
        check(rule.id, 'to.subsystem', rule.to.subsystem, 'inert')
        check(rule.id, 'to.exclude_subsystem', rule.to.exclude_subsystem, 'dead-reference')
        break
      case 'boundary':
        check(rule.id, 'protectedSubsystem', rule.protectedSubsystem, 'inert')
        for (const from of rule.allowedFrom) {
          check(rule.id, 'allowedFrom', from, 'dead-reference')
        }
        break
      // `builtin` rules reference no subsystem ids.
    }
  }

  return warnings
}
