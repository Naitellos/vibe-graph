import type { Rule } from '../../schema/rule.js'
import { noLayerViolationPreset } from './no-layer-violation.js'

/**
 * The 4 starter rules that are active by default when no user rules override them.
 * loadConfig() merges these with user-defined rules; user wins on id collision.
 */
export const DEFAULT_BUILTIN_RULES: Rule[] = [
  {
    kind: 'builtin',
    id: 'builtin:no-new-cycles',
    severity: 'high',
    mode: 'warn',
    check: 'no_cycles',
    title: 'No new architectural cycles',
    description: '',
  },
  noLayerViolationPreset,
  {
    kind: 'builtin',
    id: 'builtin:no-new-orphans',
    severity: 'low',
    mode: 'advisory',
    check: 'no_orphans',
    title: 'New files must belong to a subsystem',
    description: '',
  },
  {
    kind: 'builtin',
    id: 'builtin:drift-must-not-worsen',
    severity: 'medium',
    mode: 'warn',
    check: 'drift_must_not_worsen',
    title: 'Drift count must not increase',
    description: '',
  },
]
