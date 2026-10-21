import { describe, expect, it } from 'vitest'
import type { Rule } from '../schema/rule.js'
import {
  formatRuleAsDoNotDo,
  humanizeBuiltinTitle,
  isForbiddingRule,
  isRuleApplicableToSubsystems,
} from './prepare-task-rules.js'

// ---------------------------------------------------------------------------
// isForbiddingRule
// ---------------------------------------------------------------------------

describe('isForbiddingRule', () => {
  it('returns true for builtin no_orphans', () => {
    const rule: Rule = {
      kind: 'builtin',
      id: 'no-orphans',
      check: 'no_orphans',
      severity: 'high',
      mode: 'warn',
      title: '',
      description: '',
    }
    expect(isForbiddingRule(rule)).toBe(true)
  })

  it('returns true for builtin drift_must_not_worsen', () => {
    const rule: Rule = {
      kind: 'builtin',
      id: 'drift',
      check: 'drift_must_not_worsen',
      severity: 'medium',
      mode: 'warn',
      title: '',
      description: '',
    }
    expect(isForbiddingRule(rule)).toBe(true)
  })

  it('returns false for builtin no_cycles', () => {
    const rule: Rule = {
      kind: 'builtin',
      id: 'no-cycles',
      check: 'no_cycles',
      severity: 'high',
      mode: 'warn',
      title: '',
      description: '',
    }
    expect(isForbiddingRule(rule)).toBe(false)
  })

  it('returns true for forbidden edge-pattern rule', () => {
    const rule: Rule = {
      kind: 'edge-pattern',
      id: 'ep-rule',
      title: 'No cross-layer import',
      severity: 'high',
      mode: 'warn',
      from: { layer: 'infra' },
      to: { layer: 'domain' },
      relation: 'imports',
      forbidden: true,
      description: '',
    }
    expect(isForbiddingRule(rule)).toBe(true)
  })

  it('returns false for non-forbidden edge-pattern rule', () => {
    const rule: Rule = {
      kind: 'edge-pattern',
      id: 'ep-allowed',
      title: 'Allowed import',
      severity: 'low',
      mode: 'advisory',
      from: { layer: 'domain' },
      to: { layer: 'infra' },
      relation: 'imports',
      forbidden: false,
      description: '',
    }
    expect(isForbiddingRule(rule)).toBe(false)
  })

  it('returns true for boundary rule', () => {
    const rule: Rule = {
      kind: 'boundary',
      id: 'boundary-rule',
      title: 'Protected subsystem',
      severity: 'high',
      mode: 'enforce',
      protectedSubsystem: 'auth',
      allowedFrom: ['api'],
      description: '',
    }
    expect(isForbiddingRule(rule)).toBe(true)
  })
})

// ---------------------------------------------------------------------------
// humanizeBuiltinTitle
// ---------------------------------------------------------------------------

describe('humanizeBuiltinTitle', () => {
  it('renders no_orphans humanly', () => {
    const rule = {
      kind: 'builtin' as const,
      id: 'no-orphans',
      check: 'no_orphans' as const,
      severity: 'medium' as const,
      mode: 'warn' as const,
      title: '',
      description: '',
    }
    expect(humanizeBuiltinTitle(rule)).toBe('New files must belong to a subsystem')
  })

  it('renders drift_must_not_worsen humanly', () => {
    const rule = {
      kind: 'builtin' as const,
      id: 'drift',
      check: 'drift_must_not_worsen' as const,
      severity: 'medium' as const,
      mode: 'warn' as const,
      title: '',
      description: '',
    }
    expect(humanizeBuiltinTitle(rule)).toBe('Drift count must not increase')
  })

  it('renders no_cycles humanly', () => {
    const rule = {
      kind: 'builtin' as const,
      id: 'no-cycles',
      check: 'no_cycles' as const,
      severity: 'high' as const,
      mode: 'warn' as const,
      title: '',
      description: '',
    }
    expect(humanizeBuiltinTitle(rule)).toBe('No new architectural cycles')
  })
})

// ---------------------------------------------------------------------------
// formatRuleAsDoNotDo
// ---------------------------------------------------------------------------

describe('formatRuleAsDoNotDo', () => {
  it('formats builtin no_orphans with imperative grammar', () => {
    const rule: Rule = {
      kind: 'builtin',
      id: 'no-orphans',
      check: 'no_orphans',
      severity: 'medium',
      mode: 'warn',
      title: '',
      description: '',
    }
    const text = formatRuleAsDoNotDo(rule)
    expect(text).toMatch(/^Do not /i)
    expect(text).toContain('rule: no-orphans')
  })

  it('formats builtin drift_must_not_worsen with imperative grammar', () => {
    const rule: Rule = {
      kind: 'builtin',
      id: 'drift',
      check: 'drift_must_not_worsen',
      severity: 'medium',
      mode: 'warn',
      title: '',
      description: '',
    }
    const text = formatRuleAsDoNotDo(rule)
    expect(text).toMatch(/^Do not /i)
    expect(text).toContain('drift')
  })

  it('formats edge-pattern rule with Code in... must not...', () => {
    const rule: Rule = {
      kind: 'edge-pattern',
      id: 'no-infra-to-domain',
      title: 'No infra to domain',
      severity: 'high',
      mode: 'enforce',
      from: { layer: 'infra' },
      to: { layer: 'domain' },
      relation: 'imports',
      forbidden: true,
      description: '',
    }
    const text = formatRuleAsDoNotDo(rule)
    expect(text).toMatch(/^Code in /i)
    expect(text).toContain('must not import')
    expect(text).toContain('rule: no-infra-to-domain')
  })

  it('formats boundary rule with Do not access...', () => {
    const rule: Rule = {
      kind: 'boundary',
      id: 'protect-auth',
      title: 'Protect auth',
      severity: 'high',
      mode: 'enforce',
      protectedSubsystem: 'auth',
      allowedFrom: ['api', 'gateway'],
      description: '',
    }
    const text = formatRuleAsDoNotDo(rule)
    expect(text).toMatch(/^Do not access/i)
    expect(text).toContain('auth')
    expect(text).toContain('api')
    expect(text).toContain('rule: protect-auth')
  })

  it('formats builtin no_cycles using title when present', () => {
    const rule: Rule = {
      kind: 'builtin',
      id: 'no-cycles',
      check: 'no_cycles',
      severity: 'high',
      mode: 'warn',
      title: 'Custom cycles title',
      description: '',
    }
    expect(formatRuleAsDoNotDo(rule)).toBe('Custom cycles title')
  })

  it('formats builtin no_cycles falling back to id when title is empty', () => {
    const rule: Rule = {
      kind: 'builtin',
      id: 'no-cycles',
      check: 'no_cycles',
      severity: 'high',
      mode: 'warn',
      title: '',
      description: '',
    }
    expect(formatRuleAsDoNotDo(rule)).toBe('no-cycles')
  })

  it('formats edge-pattern rule with depends_on relation using imperative verb', () => {
    const rule: Rule = {
      kind: 'edge-pattern',
      id: 'no-payments-to-auth',
      title: 'No payments to auth',
      severity: 'high',
      mode: 'enforce',
      from: { subsystem: 'payments' },
      to: { subsystem: 'auth' },
      relation: 'depends_on',
      forbidden: true,
      description: '',
    }
    const text = formatRuleAsDoNotDo(rule)
    expect(text).toContain('must not depend on')
    expect(text).toContain('rule: no-payments-to-auth')
  })

  it('formats edge-pattern rule with calls relation using imperative verb', () => {
    const rule: Rule = {
      kind: 'edge-pattern',
      id: 'no-ui-calls-db',
      title: 'No UI to DB calls',
      severity: 'high',
      mode: 'enforce',
      from: { layer: 'ui' },
      to: { layer: 'db' },
      relation: 'calls',
      forbidden: true,
      description: '',
    }
    const text = formatRuleAsDoNotDo(rule)
    expect(text).toContain('must not call')
    expect(text).toContain('rule: no-ui-calls-db')
  })

  it('formats boundary rule with empty allowedFrom', () => {
    const rule: Rule = {
      kind: 'boundary',
      id: 'protect-core',
      title: 'Protect core',
      severity: 'high',
      mode: 'enforce',
      protectedSubsystem: 'core',
      allowedFrom: [],
      description: '',
    }
    const text = formatRuleAsDoNotDo(rule)
    expect(text).toContain('(no subsystems)')
  })
})

// ---------------------------------------------------------------------------
// isRuleApplicableToSubsystems
// ---------------------------------------------------------------------------

describe('isRuleApplicableToSubsystems', () => {
  it('returns true for builtin rule regardless of target set', () => {
    const rule: Rule = {
      kind: 'builtin',
      id: 'drift',
      check: 'drift_must_not_worsen',
      severity: 'medium',
      mode: 'warn',
      title: '',
      description: '',
    }
    expect(isRuleApplicableToSubsystems(rule, new Set(['subsystem:auth']))).toBe(true)
    expect(isRuleApplicableToSubsystems(rule, new Set())).toBe(true)
  })

  it('returns true for boundary rule regardless of target set', () => {
    const rule: Rule = {
      kind: 'boundary',
      id: 'protect-auth',
      title: 'Protect auth',
      severity: 'high',
      mode: 'enforce',
      protectedSubsystem: 'auth',
      allowedFrom: [],
      description: '',
    }
    expect(isRuleApplicableToSubsystems(rule, new Set(['subsystem:other']))).toBe(true)
    expect(isRuleApplicableToSubsystems(rule, new Set())).toBe(true)
  })

  it('returns true for edge-pattern when from subsystem is in targets', () => {
    const rule: Rule = {
      kind: 'edge-pattern',
      id: 'ep',
      title: 'EP',
      severity: 'high',
      mode: 'warn',
      from: { subsystem: 'auth' },
      to: { layer: 'domain' },
      relation: 'imports',
      forbidden: true,
      description: '',
    }
    expect(isRuleApplicableToSubsystems(rule, new Set(['subsystem:auth']))).toBe(true)
  })

  it('returns false for edge-pattern when subsystem not in targets', () => {
    const rule: Rule = {
      kind: 'edge-pattern',
      id: 'ep',
      title: 'EP',
      severity: 'high',
      mode: 'warn',
      from: { subsystem: 'payments' },
      to: { subsystem: 'auth' },
      relation: 'depends_on',
      forbidden: true,
      description: '',
    }
    expect(isRuleApplicableToSubsystems(rule, new Set(['subsystem:other']))).toBe(false)
  })

  it('returns true for edge-pattern with layer-only matcher (globally applicable)', () => {
    const rule: Rule = {
      kind: 'edge-pattern',
      id: 'ep-layer',
      title: 'Layer rule',
      severity: 'medium',
      mode: 'warn',
      from: { layer: 'infra' },
      to: { layer: 'domain' },
      relation: 'imports',
      forbidden: true,
      description: '',
    }
    expect(isRuleApplicableToSubsystems(rule, new Set(['subsystem:anything']))).toBe(true)
  })

  it('returns true for edge-pattern when only to subsystem is in targets (toHits path)', () => {
    const rule: Rule = {
      kind: 'edge-pattern',
      id: 'ep-to-only',
      title: 'To-only match',
      severity: 'high',
      mode: 'warn',
      from: { subsystem: 'payments' },
      to: { subsystem: 'auth' },
      relation: 'imports',
      forbidden: true,
      description: '',
    }
    // 'payments' is NOT in targets, but 'auth' IS — toHits fires
    expect(isRuleApplicableToSubsystems(rule, new Set(['subsystem:auth']))).toBe(true)
  })
})
