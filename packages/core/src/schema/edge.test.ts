import { describe, expect, it } from 'vitest'
import { EdgeSchema } from './edge.js'

describe('EdgeSchema', () => {
  it('parses a minimal Edge and fills defaults', () => {
    const parsed = EdgeSchema.parse({
      id: 'oracle->energy:imports',
      from: 'subsystem:oracle',
      to: 'subsystem:energy',
      kind: 'imports',
      source: 'ast',
      confidence: 'high',
    })
    expect(parsed.category).toBe('structural')
    expect(parsed.evidenceIds).toEqual([])
    expect(parsed.weight).toBe(1)
    expect(parsed.runtimeWeight).toBe(0)
    expect(parsed.typeOnlyWeight).toBe(0)
    expect(parsed.dynamicWeight).toBe(0)
    expect(parsed.metadata).toEqual({})
  })

  it('supports metadata.sources for derived aggregates', () => {
    const parsed = EdgeSchema.parse({
      id: 'oracle->energy:imports',
      from: 'subsystem:oracle',
      to: 'subsystem:energy',
      kind: 'depends_on',
      source: 'derived',
      confidence: 'high',
      metadata: { sources: ['ast', 'manual'] },
    })
    expect(parsed.metadata.sources).toEqual(['ast', 'manual'])
  })

  it('rejects non-positive weight', () => {
    expect(() =>
      EdgeSchema.parse({
        id: 'x',
        from: 'a',
        to: 'b',
        kind: 'imports',
        source: 'ast',
        confidence: 'high',
        weight: 0,
      }),
    ).toThrow()
  })

  it('rejects forbidden source `llm` (eternal invariant)', () => {
    expect(() =>
      EdgeSchema.parse({
        id: 'x',
        from: 'a',
        to: 'b',
        kind: 'imports',
        source: 'llm',
        confidence: 'high',
      }),
    ).toThrow()
  })
})
