import type { Rule } from '../../schema/rule.js'

/**
 * Built-in edge-pattern preset: forbid edges from domain layer to horizontal layer.
 *
 * This is a "Clean Architecture leak" check — domain-layer code should not
 * depend on UI/horizontal-layer code. Evaluation is performed by the engine's
 * edge-pattern evaluator (rules/edge-pattern.ts in Task 6); this file only
 * defines the preset rule shape.
 */
export const noLayerViolationPreset: Rule = {
  kind: 'edge-pattern',
  id: 'builtin:no-layer-violation',
  title: 'Domain must not depend on horizontal (UI) layer',
  severity: 'medium',
  mode: 'advisory',
  from: { layer: 'domain' },
  to: { layer: 'horizontal' },
  relation: 'depends_on',
  forbidden: true,
  description:
    'Clean Architecture leak: domain-layer subsystems must not depend on horizontal-layer subsystems.',
}
