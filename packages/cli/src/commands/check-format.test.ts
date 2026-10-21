import { describe, expect, it } from 'vitest'
import { formatCheckResult } from './check-format.js'

describe('formatCheckResult', () => {
  it('text mode with zero findings prints "No rule violations"', () => {
    const out = formatCheckResult({ status: 'ok', ruleFindings: [], exitCode: 0 }, { json: false })
    expect(out.text).toContain('No rule violations')
    expect(out.exitCode).toBe(0)
  })

  it('text mode lists each finding with severity and ruleId', () => {
    const out = formatCheckResult(
      {
        status: 'ok',
        exitCode: 0,
        ruleFindings: [
          {
            id: 'rule:x:1',
            domain: 'rule',
            type: 'rule-violation',
            detectorId: 'rules-engine',
            severity: 'medium',
            title: 'Test violation',
            summary: '',
            involvedNodeIds: [],
            evidenceIds: [],
            status: 'open',
            metadata: { ruleId: 'custom:x', mode: 'warn' },
          },
        ],
      },
      { json: false },
    )
    expect(out.text).toContain('custom:x')
    expect(out.text).toContain('medium')
    expect(out.text).toContain('warn')
    expect(out.text).toContain('Test violation')
  })

  it('json mode emits a parseable JSON object', () => {
    const out = formatCheckResult({ status: 'ok', ruleFindings: [], exitCode: 0 }, { json: true })
    const parsed = JSON.parse(out.text)
    expect(parsed).toMatchObject({ status: 'ok', exitCode: 0, findings: [] })
  })

  it('text mode surfaces inert rules even when there are no violations (not a clean pass)', () => {
    const out = formatCheckResult(
      {
        status: 'ok',
        exitCode: 0,
        ruleFindings: [],
        inertRules: [
          {
            ruleId: 'core-neutrality',
            unknownSubsystem: 'core-engine',
            field: 'from.subsystem',
            kind: 'inert' as const,
          },
        ],
      },
      { json: false },
    )
    // The clean-pass line is still there...
    expect(out.text).toContain('No rule violations')
    // ...but the inert-rule warning makes clear it is not a genuine green.
    expect(out.text).toContain('core-neutrality')
    expect(out.text).toContain('core-engine')
    expect(out.text.toLowerCase()).toContain('inert')
  })

  it('json mode includes inertRules', () => {
    const out = formatCheckResult(
      {
        status: 'ok',
        exitCode: 0,
        ruleFindings: [],
        inertRules: [
          {
            ruleId: 'r1',
            unknownSubsystem: 'ghost',
            field: 'to.subsystem',
            kind: 'inert' as const,
          },
        ],
      },
      { json: true },
    )
    const parsed = JSON.parse(out.text)
    expect(parsed.inertRules).toEqual([
      { ruleId: 'r1', unknownSubsystem: 'ghost', field: 'to.subsystem', kind: 'inert' },
    ])
  })

  it('text mode words a dead exclusion as broader matching, NOT as inert', () => {
    const out = formatCheckResult(
      {
        status: 'ok',
        exitCode: 0,
        ruleFindings: [],
        inertRules: [
          {
            ruleId: 'r1',
            unknownSubsystem: 'ghost',
            field: 'to.exclude_subsystem',
            kind: 'dead-reference' as const,
          },
        ],
      },
      { json: false },
    )
    // A dead exclusion widens the rule — calling it "inert" would invert the risk.
    expect(out.text).toContain('matches more broadly')
    expect(out.text).not.toContain('rule is inert')
    expect(out.text).toContain('No rule violations')
  })

  it('text mode shows a strict-rules failure verdict for inert rules (not a green pass)', () => {
    const out = formatCheckResult(
      {
        status: 'ok',
        exitCode: 1,
        ruleFindings: [],
        inertRules: [
          {
            ruleId: 'r1',
            unknownSubsystem: 'ghost',
            field: 'from.subsystem',
            kind: 'inert' as const,
          },
        ],
        strictInertFailure: true,
      },
      { json: false },
    )
    expect(out.exitCode).toBe(1)
    expect(out.text).not.toContain('No rule violations')
    expect(out.text.toLowerCase()).toContain('strict-rules')
    expect(out.text).toContain('ghost')
  })

  it('markdown mode shows a strict-rules failure verdict for inert rules (not a green check)', () => {
    const out = formatCheckResult(
      {
        status: 'ok',
        exitCode: 1,
        ruleFindings: [],
        inertRules: [
          {
            ruleId: 'r1',
            unknownSubsystem: 'ghost',
            field: 'from.subsystem',
            kind: 'inert' as const,
          },
        ],
        strictInertFailure: true,
      },
      { json: false, markdown: true },
    )
    expect(out.exitCode).toBe(1)
    expect(out.text).not.toContain('✅ No rule violations')
    expect(out.text.toLowerCase()).toContain('strict-rules')
  })

  it('markdown mode surfaces inert rules alongside the verdict', () => {
    const out = formatCheckResult(
      {
        status: 'ok',
        exitCode: 0,
        ruleFindings: [],
        inertRules: [
          {
            ruleId: 'core-neutrality',
            unknownSubsystem: 'core-engine',
            field: 'from.subsystem',
            kind: 'inert' as const,
          },
        ],
      },
      { json: false, markdown: true },
    )
    expect(out.text).toContain('core-neutrality')
    expect(out.text).toContain('core-engine')
    expect(out.text.toLowerCase()).toContain('inert')
    expect(out.text).toContain('<!-- vibe-graph-check -->')
  })
})

describe('formatCheckResult — markdown mode', () => {
  it('clean result shows the header and a green check', () => {
    const out = formatCheckResult(
      { status: 'ok', ruleFindings: [], exitCode: 0 },
      { json: false, markdown: true },
    )
    expect(out.text).toContain('## 🔭 Vibe Graph — Architecture Check')
    expect(out.text).toContain('✅ No rule violations')
    expect(out.text).toContain('<!-- vibe-graph-check -->')
    expect(out.exitCode).toBe(0)
  })

  it('renders findings as a table and escapes pipes in titles', () => {
    const out = formatCheckResult(
      {
        status: 'ok',
        exitCode: 1,
        ruleFindings: [
          {
            id: 'rule:x:1',
            domain: 'rule',
            type: 'rule-violation',
            detectorId: 'rules-engine',
            severity: 'high',
            title: 'A | risky edge',
            summary: '',
            involvedNodeIds: [],
            evidenceIds: [],
            status: 'open',
            metadata: { ruleId: 'custom:x', mode: 'enforce' },
          },
        ],
      },
      { json: false, markdown: true },
    )
    expect(out.text).toContain('| Rule | Severity | Mode | Title |')
    expect(out.text).toContain('custom:x')
    expect(out.text).toContain('A \\| risky edge') // pipe escaped
    expect(out.text).toContain('Enforce violation')
    expect(out.exitCode).toBe(1)
  })

  it('renders the advisory verdict line when there is no enforce violation', () => {
    const out = formatCheckResult(
      {
        status: 'ok',
        exitCode: 0,
        ruleFindings: [
          {
            id: 'rule:w:1',
            domain: 'rule',
            type: 'rule-violation',
            detectorId: 'rules-engine',
            severity: 'medium',
            title: 'advisory thing',
            summary: '',
            involvedNodeIds: [],
            evidenceIds: [],
            status: 'open',
            metadata: { ruleId: 'custom:w', mode: 'warn' },
          },
        ],
      },
      { json: false, markdown: true },
    )
    expect(out.text).toContain('advisory finding(s)')
    expect(out.text).not.toContain('Enforce violation')
    expect(out.exitCode).toBe(0)
  })

  it('markdown error block still carries the marker', () => {
    const out = formatCheckResult(
      { status: 'error', error: 'No graph.json' },
      { json: false, markdown: true },
    )
    expect(out.text).toContain('No graph.json')
    expect(out.text).toContain('<!-- vibe-graph-check -->')
    expect(out.exitCode).toBe(1)
  })
})
