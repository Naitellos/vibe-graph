/**
 * Invariant: 'llm' is NOT a valid EdgeSource.
 *
 * Product principle: "LLM never produces edges as evidence."
 * All graph structure must be grounded in deterministic analyzers
 * (ast, config, yaml, manual, derived). Allowing LLM-sourced edges
 * would undermine auditability and reproducibility of the dependency graph.
 *
 * EdgeSourceSchema = z.enum(['ast', 'config', 'yaml', 'manual', 'derived'])
 * — 'llm' is deliberately absent.
 */
import { describe, expect, it } from 'vitest'
import { EdgeSchema } from '../../packages/core/src/schema/edge.js'

/** A minimal valid edge stub with every required field present. */
const validEdgeStub = {
  id: 'edge:A:B:imports',
  from: 'A',
  to: 'B',
  kind: 'imports',
  category: 'structural',
  source: 'ast',
  confidence: 'high',
  evidenceIds: [],
  weight: 1,
  runtimeWeight: 0,
  typeOnlyWeight: 0,
  dynamicWeight: 0,
  metadata: {},
} as const

describe("invariant: 'llm' is rejected as an EdgeSource", () => {
  it('valid edge stub with source=ast parses without throwing (baseline)', () => {
    expect(() => EdgeSchema.parse(validEdgeStub)).not.toThrow()
  })

  it("EdgeSchema.parse with source='llm' always throws a ZodError", () => {
    const invalidEdge = { ...validEdgeStub, source: 'llm' }
    // ZodError is the expected error type from schema validation failure.
    try {
      EdgeSchema.parse(invalidEdge)
      // Should not reach here
      expect(true).toBe(false)
    } catch (error) {
      // Verify the error has the characteristic properties of a ZodError
      expect(error).toHaveProperty('issues')
      expect(error).toHaveProperty('message')
    }
  })

  it("EdgeSchema.safeParse with source='llm' reports failure (no throw variant)", () => {
    const invalidEdge = { ...validEdgeStub, source: 'llm' }
    const result = EdgeSchema.safeParse(invalidEdge)
    expect(result.success).toBe(false)
  })
})
