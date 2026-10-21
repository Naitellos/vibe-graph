import { describe, expect, it } from 'vitest'
import { ContextPackSchema, ContextRelationshipSchema } from './context-pack.js'

describe('ContextRelationshipSchema', () => {
  it('parses a compact relationship', () => {
    const parsed = ContextRelationshipSchema.parse({
      from: 'subsystem:oracle',
      to: 'subsystem:energy',
      kind: 'depends_on',
      confidence: 'high',
      evidenceCount: 3,
    })
    expect(parsed.evidenceCount).toBe(3)
  })

  it('rejects negative evidenceCount', () => {
    expect(() =>
      ContextRelationshipSchema.parse({
        from: 'a',
        to: 'b',
        kind: 'imports',
        confidence: 'high',
        evidenceCount: -1,
      }),
    ).toThrow()
  })
})

describe('ContextPackSchema', () => {
  it('parses a minimal ContextPack with default empty metadata', () => {
    const parsed = ContextPackSchema.parse({
      id: 'ctx_x',
      target: 'subsystem:oracle',
      tokenBudget: 8000,
      estimatedTokens: 1234,
      tokenEstimateMethod: 'char-div-4',
      summary: 'Oracle subsystem.',
      facts: [],
      criticalFiles: [],
      relationships: [],
      blastRadius: [],
    })
    expect(parsed.recommendations).toEqual([])
    expect(parsed.tests).toEqual([])
    expect(parsed.doNotDo).toEqual([])
    expect(parsed.metadata).toEqual({})
  })

  it('accepts redactions metadata', () => {
    const parsed = ContextPackSchema.parse({
      id: 'ctx_x',
      target: 'subsystem:oracle',
      tokenBudget: 8000,
      estimatedTokens: 100,
      tokenEstimateMethod: 'char-div-4',
      summary: 'x',
      facts: [],
      criticalFiles: [],
      relationships: [],
      blastRadius: [],
      metadata: {
        redactions: { totalCount: 2, byKind: { 'openai-key': 2 } },
      },
    })
    expect(parsed.metadata.redactions?.totalCount).toBe(2)
    expect(parsed.metadata.redactions?.byKind['openai-key']).toBe(2)
  })

  it('rejects wrong tokenEstimateMethod', () => {
    expect(() =>
      ContextPackSchema.parse({
        id: 'x',
        target: 't',
        tokenBudget: 1,
        estimatedTokens: 1,
        tokenEstimateMethod: 'tiktoken',
        summary: '',
        facts: [],
        criticalFiles: [],
        relationships: [],
        blastRadius: [],
      }),
    ).toThrow()
  })
})
