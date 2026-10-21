import { describe, expect, it } from 'vitest'
import { formatHookOutput, formatValidateDiffResult } from './validate-diff-format.js'

describe('formatValidateDiffResult — markdown mode', () => {
  const base = {
    status: 'ok' as const,
    verdict: 'ok' as const,
    newViolations: [],
    removedViolations: [],
    newFindings: [],
    removedFindings: [],
    exitCode: 0 as const,
  }

  it('clean diff shows OK badge, header and marker', () => {
    const out = formatValidateDiffResult(base, { json: false, markdown: true })
    expect(out.text).toContain('## 🔭 Vibe Graph — Diff Validation')
    expect(out.text).toContain('✅ **OK**')
    expect(out.text).toContain('No new architecture risks')
    expect(out.text).toContain('<!-- vibe-graph-validate-diff -->')
    expect(out.exitCode).toBe(0)
  })

  it('violation renders a table and escapes pipes', () => {
    const out = formatValidateDiffResult(
      {
        ...base,
        verdict: 'violation',
        exitCode: 1,
        newViolations: [
          {
            id: 'rule:y:1',
            domain: 'rule',
            type: 'rule-violation',
            detectorId: 'rules-engine',
            severity: 'high',
            title: 'forbidden | edge',
            summary: '',
            involvedNodeIds: [],
            evidenceIds: [],
            status: 'open',
            metadata: { ruleId: 'no-ui-import', mode: 'enforce' },
          },
        ],
      },
      { json: false, markdown: true },
    )
    expect(out.text).toContain('❌ **VIOLATION**')
    expect(out.text).toContain('| Rule | Severity | Mode | Title |')
    expect(out.text).toContain('no-ui-import')
    expect(out.text).toContain('forbidden \\| edge')
    expect(out.exitCode).toBe(1)
  })

  it('markdown error block carries the marker', () => {
    const out = formatValidateDiffResult(
      { status: 'error', error: 'NO_BASELINE' },
      { json: false, markdown: true },
    )
    expect(out.text).toContain('NO_BASELINE')
    expect(out.text).toContain('<!-- vibe-graph-validate-diff -->')
    expect(out.exitCode).toBe(1)
  })

  it('warn verdict renders the WARN badge, new-findings list, and resolved line', () => {
    const out = formatValidateDiffResult(
      {
        ...base,
        verdict: 'warn',
        exitCode: 0,
        newFindings: [
          {
            id: 'find:1',
            domain: 'rule',
            type: 'rule-violation',
            detectorId: 'cycles',
            severity: 'medium',
            title: 'new cycle introduced',
            summary: '',
            involvedNodeIds: [],
            evidenceIds: [],
            status: 'open',
            metadata: {},
          },
        ],
        removedViolations: [
          {
            id: 'rule:z:1',
            domain: 'rule',
            type: 'rule-violation',
            detectorId: 'rules-engine',
            severity: 'low',
            title: 'old violation',
            summary: '',
            involvedNodeIds: [],
            evidenceIds: [],
            status: 'open',
            metadata: { ruleId: 'r', mode: 'warn' },
          },
        ],
      },
      { json: false, markdown: true },
    )
    expect(out.text).toContain('⚠️ **WARN**')
    expect(out.text).toContain('New findings (1)')
    expect(out.text).toContain('new cycle introduced')
    expect(out.text).toContain('Resolved 1 prior violation(s)')
    expect(out.exitCode).toBe(0)
  })
})

describe('formatValidateDiffResult', () => {
  it('text mode with verdict ok prints clean summary', () => {
    const out = formatValidateDiffResult(
      {
        status: 'ok',
        verdict: 'ok',
        newViolations: [],
        removedViolations: [],
        newFindings: [],
        removedFindings: [],
        exitCode: 0,
      },
      { json: false },
    )
    expect(out.text).toContain('Status: OK')
    expect(out.exitCode).toBe(0)
  })

  it('text mode with verdict violation lists newViolations and exits 1', () => {
    const out = formatValidateDiffResult(
      {
        status: 'ok',
        verdict: 'violation',
        exitCode: 1,
        newViolations: [
          {
            id: 'rule:custom:test:edge1',
            domain: 'rule',
            type: 'rule-violation',
            detectorId: 'rules-engine',
            severity: 'high',
            title: 'Test violation',
            summary: '',
            involvedNodeIds: [],
            evidenceIds: [],
            status: 'open',
            metadata: { ruleId: 'custom:test', mode: 'enforce' },
          },
        ],
        removedViolations: [],
        newFindings: [],
        removedFindings: [],
      },
      { json: false },
    )
    expect(out.text).toContain('VIOLATIONS')
    expect(out.text).toContain('custom:test')
    expect(out.text).toContain('Status: VIOLATION')
    expect(out.exitCode).toBe(1)
  })

  it('json mode emits parseable JSON with verdict + arrays', () => {
    const out = formatValidateDiffResult(
      {
        status: 'ok',
        verdict: 'warn',
        exitCode: 0,
        newViolations: [],
        removedViolations: [],
        newFindings: [],
        removedFindings: [],
      },
      { json: true },
    )
    const parsed = JSON.parse(out.text)
    expect(parsed).toMatchObject({
      status: 'ok',
      verdict: 'warn',
      exitCode: 0,
      newViolations: [],
      removedViolations: [],
      newFindings: [],
      removedFindings: [],
    })
  })

  it('text mode renders error state when result.status === "error"', () => {
    const out = formatValidateDiffResult(
      { status: 'error', error: 'NO_BASELINE: …' },
      { json: false },
    )
    expect(out.text).toContain('Error')
    expect(out.text).toContain('NO_BASELINE')
    expect(out.exitCode).toBe(1)
  })
})

describe('formatValidateDiffResult — markdown conformance headline', () => {
  it('markdown output contains the conformance headline when present', () => {
    const result = {
      status: 'ok' as const,
      verdict: 'ok' as const,
      exitCode: 0 as const,
      newViolations: [],
      removedViolations: [],
      newFindings: [],
      removedFindings: [],
      conformance: {
        headline: 'This change introduced 1 new cross-subsystem link (billing → analytics).',
        byKind: { cycles: 0, coupling: 1, boundaries: 0, orphans: 0 },
      },
    }
    const out = formatValidateDiffResult(result, { json: false, markdown: true })
    expect(out.text).toContain(
      'This change introduced 1 new cross-subsystem link (billing → analytics).',
    )
  })
})

describe('formatValidateDiffResult — plain text conformance headline', () => {
  it('plain output first non-empty line contains the conformance headline', () => {
    const result = {
      status: 'ok' as const,
      verdict: 'ok' as const,
      exitCode: 0 as const,
      newViolations: [],
      removedViolations: [],
      newFindings: [],
      removedFindings: [],
      conformance: {
        headline: 'This change introduced 1 new cross-subsystem link (billing → analytics).',
        byKind: { cycles: 0, coupling: 1, boundaries: 0, orphans: 0 },
      },
    }
    const out = formatValidateDiffResult(result, { json: false })
    const firstNonEmpty = out.text.split('\n').find((l) => l.trim() !== '')
    expect(firstNonEmpty).toContain(
      'This change introduced 1 new cross-subsystem link (billing → analytics).',
    )
  })
})

const clean = { status: 'ok', conformance: undefined, newViolations: [], newFindings: [] } as never
const dirty = {
  status: 'ok',
  conformance: {
    headline: 'This change introduced 1 new cross-subsystem link (billing → analytics).',
    byKind: { cycles: 0, coupling: 1, boundaries: 0, orphans: 0 },
  },
  newViolations: [],
  newFindings: [{ title: 'New coupling: billing → analytics (areas were independent)' }],
} as never

describe('formatHookOutput', () => {
  it('emits nothing when clean', () => {
    expect(formatHookOutput(clean, 'advisory')).toBe('')
  })
  it('advisory emits additionalContext JSON with the headline', () => {
    const o = JSON.parse(formatHookOutput(dirty, 'advisory'))
    expect(o.hookSpecificOutput.hookEventName).toBe('PostToolUse')
    expect(o.hookSpecificOutput.additionalContext).toContain('billing → analytics')
  })
  it('enforce emits decision:block + reason', () => {
    const o = JSON.parse(formatHookOutput(dirty, 'enforce'))
    expect(o.decision).toBe('block')
    expect(o.reason).toContain('billing → analytics')
  })
})

describe('formatHookOutput — dedup: new-coupling line suppressed when undeclared covers same edge', () => {
  const base = {
    status: 'ok' as const,
    conformance: {
      headline: 'This change introduced 1 new cross-subsystem link (alpha → beta).',
      byKind: { cycles: 0, coupling: 1, boundaries: 0, orphans: 0 },
    },
    newViolations: [] as never[],
  }

  it('suppresses the new-coupling detail line when an undeclared finding covers the same edge', () => {
    const result = {
      ...base,
      newFindings: [
        {
          type: 'new-coupling',
          title: 'New coupling: alpha → beta (areas were independent)',
          involvedNodeIds: ['subsystem:alpha', 'subsystem:beta'],
        },
        {
          type: 'undeclared',
          title: 'Undeclared dependency: alpha imports beta',
          involvedNodeIds: ['subsystem:alpha', 'subsystem:beta'],
        },
      ],
    } as never
    const o = JSON.parse(formatHookOutput(result, 'advisory'))
    const ctx: string = o.hookSpecificOutput.additionalContext
    // undeclared line must appear
    expect(ctx).toContain('Undeclared dependency: alpha imports beta')
    // new-coupling line must be suppressed (same edge covered by undeclared)
    expect(ctx).not.toContain('New coupling: alpha → beta')
    // headline must still appear
    expect(ctx).toContain('1 new cross-subsystem link')
  })

  it('shows the new-coupling detail line when there is no matching undeclared finding', () => {
    const result = {
      ...base,
      newFindings: [
        {
          type: 'new-coupling',
          title: 'New coupling: alpha → beta (areas were independent)',
          involvedNodeIds: ['subsystem:alpha', 'subsystem:beta'],
        },
      ],
    } as never
    const o = JSON.parse(formatHookOutput(result, 'advisory'))
    const ctx: string = o.hookSpecificOutput.additionalContext
    expect(ctx).toContain('New coupling: alpha → beta')
  })

  it('does not suppress new-coupling when undeclared is for a different edge', () => {
    const result = {
      ...base,
      newFindings: [
        {
          type: 'new-coupling',
          title: 'New coupling: alpha → beta (areas were independent)',
          involvedNodeIds: ['subsystem:alpha', 'subsystem:beta'],
        },
        {
          type: 'undeclared',
          title: 'Undeclared dependency: x imports y',
          involvedNodeIds: ['subsystem:x', 'subsystem:y'],
        },
      ],
    } as never
    const o = JSON.parse(formatHookOutput(result, 'advisory'))
    const ctx: string = o.hookSpecificOutput.additionalContext
    expect(ctx).toContain('New coupling: alpha → beta')
    expect(ctx).toContain('Undeclared dependency: x imports y')
  })
})
