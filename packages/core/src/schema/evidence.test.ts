import { describe, expect, it } from 'vitest'
import { EvidenceSchema } from './evidence.js'

describe('EvidenceSchema', () => {
  it('parses a minimal Evidence with default coupling=runtime', () => {
    const parsed = EvidenceSchema.parse({
      id: 'ev_abc123',
      sourceKind: 'ast',
      file: 'server/oracle.ts',
      detail: "import { energyService } from './energy'",
      confidence: 'high',
    })
    expect(parsed.coupling).toBe('runtime')
    expect(parsed.line).toBeUndefined()
  })

  it('accepts line/column/symbol for AST evidence', () => {
    const parsed = EvidenceSchema.parse({
      id: 'ev_1',
      sourceKind: 'ast',
      file: 'server/oracle.ts',
      line: 12,
      column: 4,
      symbol: 'energyService',
      detail: "import { energyService } from './energy'",
      confidence: 'high',
      coupling: 'type-only',
    })
    expect(parsed.line).toBe(12)
    expect(parsed.symbol).toBe('energyService')
    expect(parsed.coupling).toBe('type-only')
  })

  it('rejects non-positive line', () => {
    expect(() =>
      EvidenceSchema.parse({
        id: 'ev_1',
        sourceKind: 'ast',
        file: 'a.ts',
        line: 0,
        detail: 'x',
        confidence: 'high',
      }),
    ).toThrow()
  })

  it('rejects unknown coupling', () => {
    expect(() =>
      EvidenceSchema.parse({
        id: 'ev_1',
        sourceKind: 'ast',
        file: 'a.ts',
        detail: 'x',
        confidence: 'high',
        coupling: 'spooky',
      }),
    ).toThrow()
  })
})
