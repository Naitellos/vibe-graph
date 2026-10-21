import type { Finding } from '@codearch/core'
import { describe, expect, it } from 'vitest'
import { sortFindings } from './sort-findings.js'

function makeFinding(
  id: string,
  severity: Finding['severity'],
  involvedNodeIds: string[],
): Finding {
  return {
    id,
    domain: 'architecture',
    type: 'cycle',
    detectorId: 'test',
    severity,
    title: `Finding ${id}`,
    summary: 'test summary',
    involvedNodeIds,
    evidenceIds: [],
    status: 'open',
    metadata: {},
  }
}

describe('sortFindings', () => {
  it('sorts 3 findings by severity desc (high first, low last)', () => {
    const findings = [
      makeFinding('low-1', 'low', ['a']),
      makeFinding('high-1', 'high', ['a']),
      makeFinding('med-1', 'medium', ['a']),
    ]
    const sorted = sortFindings(findings)
    expect(sorted.at(0)?.severity).toBe('high')
    expect(sorted.at(1)?.severity).toBe('medium')
    expect(sorted.at(2)?.severity).toBe('low')
  })

  it('breaks ties by involvedNodeIds.length desc', () => {
    const findings = [
      makeFinding('a', 'medium', ['x']),
      makeFinding('b', 'medium', ['x', 'y', 'z']),
    ]
    const sorted = sortFindings(findings)
    expect(sorted.at(0)?.id).toBe('b')
    expect(sorted.at(1)?.id).toBe('a')
  })

  it('breaks ties by id alphabetically when severity and count are equal', () => {
    const findings = [
      makeFinding('zebra', 'medium', ['x', 'y']),
      makeFinding('alpha', 'medium', ['x', 'y']),
    ]
    const sorted = sortFindings(findings)
    expect(sorted.at(0)?.id).toBe('alpha')
    expect(sorted.at(1)?.id).toBe('zebra')
  })

  it('does not mutate the original array', () => {
    const findings = [makeFinding('b', 'high', ['x']), makeFinding('a', 'low', ['x'])]
    const original = [...findings]
    sortFindings(findings)
    expect(findings).toEqual(original)
  })
})
