import type { Finding } from '../schema/finding.js'
import type { GraphBaseline } from '../schema/graph-baseline.js'
import type { Rule } from '../schema/rule.js'
import type { LoadedSnapshot } from '../snapshot/load-snapshot.js'
import { evaluateBoundary } from './boundary.js'
import { evaluateDriftMustNotWorsen } from './builtin/drift-must-not-worsen.js'
import { evaluateNoNewCycles } from './builtin/no-new-cycles.js'
import { evaluateNoNewOrphans } from './builtin/no-new-orphans.js'
import { evaluateEdgePattern } from './edge-pattern.js'

// ── Canonical evaluator context ───────────────────────────────────────────────

/**
 * Shared context type passed to every rule evaluator (edge-pattern, boundary,
 * and all builtin evaluators). Extracted here so all evaluators reference a
 * single authoritative type rather than duplicating the shape.
 *
 * `BuiltinRuleContext` in no-new-cycles.ts is kept as a compat alias so
 * existing imports continue to work.
 */
export interface RuleEvaluatorContext {
  snapshot: LoadedSnapshot
  baseline: GraphBaseline | null
}

// ── Engine entry point ────────────────────────────────────────────────────────

export interface EvaluateRulesContext {
  snapshot: LoadedSnapshot
  baseline: GraphBaseline | null
  rules: Rule[]
}

/**
 * Evaluates all rules against the working snapshot and returns an aggregated
 * list of Findings. Dispatches each rule to its kind-specific pure evaluator.
 */
export function evaluateRules(ctx: EvaluateRulesContext): Finding[] {
  const out: Finding[] = []
  const evalCtx: RuleEvaluatorContext = { snapshot: ctx.snapshot, baseline: ctx.baseline }

  for (const rule of ctx.rules) {
    switch (rule.kind) {
      case 'edge-pattern':
        out.push(...evaluateEdgePattern(rule, evalCtx))
        break
      case 'boundary':
        out.push(...evaluateBoundary(rule, evalCtx))
        break
      case 'builtin':
        switch (rule.check) {
          case 'no_cycles':
            out.push(...evaluateNoNewCycles(rule, evalCtx))
            break
          case 'no_orphans':
            out.push(...evaluateNoNewOrphans(rule, evalCtx))
            break
          case 'drift_must_not_worsen':
            out.push(...evaluateDriftMustNotWorsen(rule, evalCtx))
            break
        }
        break
    }
  }

  return out
}
