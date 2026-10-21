import { describe, expect, it } from 'vitest'
import { ValidateDiffInputSchema, ValidateDiffOutputSchema } from './diff-validation.js'

describe('ValidateDiffInputSchema', () => {
  it('accepts taskId + diff text', () => {
    const parsed = ValidateDiffInputSchema.parse({
      taskId: 'task_abc',
      diff: 'diff --git a/x b/x\n',
      mode: 'advisory',
    })
    expect(parsed.taskId).toBe('task_abc')
  })

  it('accepts workingFiles instead of diff', () => {
    const parsed = ValidateDiffInputSchema.parse({
      workingFiles: ['a.ts', 'b.ts'],
    })
    expect(parsed.workingFiles).toEqual(['a.ts', 'b.ts'])
  })

  it('accepts neither diff nor workingFiles (will use git diff)', () => {
    const parsed = ValidateDiffInputSchema.parse({})
    expect(parsed.diff).toBeUndefined()
    expect(parsed.workingFiles).toBeUndefined()
  })

  it('defaults mode to advisory', () => {
    const parsed = ValidateDiffInputSchema.parse({})
    expect(parsed.mode).toBe('advisory')
  })

  it('rejects invalid mode', () => {
    expect(() => ValidateDiffInputSchema.parse({ mode: 'gate' })).toThrow()
  })
})

describe('ValidateDiffOutputSchema', () => {
  it('parses complete output shape', () => {
    const parsed = ValidateDiffOutputSchema.parse({
      taskId: 'task_x',
      status: 'ok',
      summary: 'no changes',
      newViolations: [],
      removedViolations: [],
      newFindings: [],
      removedFindings: [],
      graphDelta: { newEdges: [], removedEdges: [], newNodes: [], removedNodes: [] },
      scope: {
        taskLinked: false,
        plannedFiles: [],
        changedFiles: [],
        deletedFiles: [],
        outOfScopeFiles: [],
        omittedGraphDelta: { newEdges: 0, removedEdges: 0, newNodes: 0, removedNodes: 0 },
      },
      riskDelta: { blastRadius: {} },
      recommendations: [],
      missingTests: [],
      baselineSnapshotId: 'scan_x',
    })
    expect(parsed.status).toBe('ok')
  })
})

describe('ValidateDiffOutputSchema conformance', () => {
  const base = {
    status: 'ok' as const,
    summary: '',
    newViolations: [],
    removedViolations: [],
    newFindings: [],
    removedFindings: [],
    graphDelta: { newEdges: [], removedEdges: [], newNodes: [], removedNodes: [] },
    scope: {
      taskLinked: false,
      plannedFiles: [],
      changedFiles: [],
      deletedFiles: [],
      outOfScopeFiles: [],
      omittedGraphDelta: { newEdges: 0, removedEdges: 0, newNodes: 0, removedNodes: 0 },
    },
    riskDelta: { blastRadius: {} },
    recommendations: [],
    missingTests: [],
    baselineSnapshotId: 'snap-1',
  }
  it('accepts output with no conformance (optional)', () => {
    expect(ValidateDiffOutputSchema.parse(base).conformance).toBeUndefined()
  })
  it('accepts a conformance summary', () => {
    const parsed = ValidateDiffOutputSchema.parse({
      ...base,
      conformance: {
        headline: 'This change introduced 1 new cycle.',
        byKind: { cycles: 1, coupling: 0, boundaries: 0, orphans: 0 },
      },
    })
    expect(parsed.conformance?.byKind.cycles).toBe(1)
  })
})
