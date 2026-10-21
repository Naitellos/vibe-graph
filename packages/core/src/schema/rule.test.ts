import { describe, expect, it } from 'vitest'
import { RuleModeSchema, RuleSchema } from './rule.js'

describe('RuleSchema', () => {
  it('parses an edge-pattern rule with all required fields', () => {
    const parsed = RuleSchema.parse({
      kind: 'edge-pattern',
      id: 'no-domain-to-ui',
      title: 'Domain must not depend on UI',
      severity: 'high',
      from: { layer: 'domain' },
      to: { layer: 'horizontal' },
    })
    expect(parsed.kind).toBe('edge-pattern')
    if (parsed.kind === 'edge-pattern') {
      expect(parsed.forbidden).toBe(true)
      expect(parsed.relation).toBe('depends_on')
      expect(parsed.mode).toBe('advisory')
    }
  })

  it('parses a boundary rule', () => {
    const parsed = RuleSchema.parse({
      kind: 'boundary',
      id: 'payments-boundary',
      title: 'Payments only via payments-api',
      severity: 'high',
      mode: 'warn',
      protectedSubsystem: 'payments',
      allowedFrom: ['payments-api'],
    })
    expect(parsed.kind).toBe('boundary')
    if (parsed.kind === 'boundary') {
      expect(parsed.protectedSubsystem).toBe('payments')
      expect(parsed.allowedFrom).toEqual(['payments-api'])
    }
  })

  it('parses a builtin rule', () => {
    const parsed = RuleSchema.parse({
      kind: 'builtin',
      id: 'builtin:no-new-cycles',
      severity: 'high',
      mode: 'warn',
      check: 'no_cycles',
    })
    expect(parsed.kind).toBe('builtin')
    if (parsed.kind === 'builtin') {
      expect(parsed.check).toBe('no_cycles')
    }
  })

  it('rejects edge-pattern with empty NodeMatcher', () => {
    expect(() =>
      RuleSchema.parse({
        kind: 'edge-pattern',
        id: 'bad',
        title: 't',
        severity: 'high',
        from: {},
        to: { layer: 'domain' },
      }),
    ).toThrow()
  })

  it('rejects unknown kind', () => {
    expect(() =>
      RuleSchema.parse({
        kind: 'something-else',
        id: 'x',
        title: 't',
        severity: 'high',
      }),
    ).toThrow()
  })

  it('rejects unknown severity', () => {
    expect(() =>
      RuleSchema.parse({
        kind: 'builtin',
        id: 'x',
        severity: 'critical',
        check: 'no_cycles',
      }),
    ).toThrow()
  })

  it('RuleModeSchema defaults to advisory', () => {
    const parsed = RuleModeSchema.parse(undefined)
    expect(parsed).toBe('advisory')
  })

  it('RuleModeSchema rejects unknown mode', () => {
    expect(() => RuleModeSchema.parse('gate')).toThrow()
  })
})
