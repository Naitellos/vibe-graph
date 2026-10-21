import { describe, expect, it } from 'vitest'
import { FindingSchema } from './finding.js'

describe('FindingSchema', () => {
  it('parses a known v0 finding type', () => {
    const parsed = FindingSchema.parse({
      id: 'fnd_1',
      domain: 'architecture',
      type: 'cycle',
      detectorId: 'core/cycles',
      severity: 'high',
      title: 'Cycle detected',
      summary: 'Oracle ↔ Memory',
      involvedNodeIds: ['subsystem:oracle', 'subsystem:memory'],
    })
    expect(parsed.status).toBe('open')
    expect(parsed.evidenceIds).toEqual([])
  })

  it('accepts an unknown extensible type (plugin-defined)', () => {
    const parsed = FindingSchema.parse({
      id: 'fnd_2',
      domain: 'security',
      type: 'public-sensitive-write',
      detectorId: 'plugin/sec',
      severity: 'high',
      title: 'X',
      summary: 'Y',
      involvedNodeIds: [],
    })
    expect(parsed.type).toBe('public-sensitive-write')
  })

  it('rejects unknown domain', () => {
    expect(() =>
      FindingSchema.parse({
        id: 'fnd_1',
        domain: 'cosmic',
        type: 'cycle',
        detectorId: 'core/cycles',
        severity: 'high',
        title: 'X',
        summary: 'Y',
        involvedNodeIds: [],
      }),
    ).toThrow()
  })
})
