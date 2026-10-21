import { Buffer } from 'node:buffer'
import type { ValidateDiffOutput } from '@codearch/core'
import { describe, expect, it } from 'vitest'
import { formatValidateDiffText } from './validate-diff.js'

describe('formatValidateDiffText', () => {
  it('keeps the fallback compact even when structuredContent contains many details', () => {
    const titles = Array.from({ length: 100 }, (_, index) => `Finding ${index} ${'x'.repeat(200)}`)
    const output = {
      taskId: 'task_2026-07-24_fd2fb03e',
      status: 'warn',
      summary: '100 new/worsened finding(s), 0 resolved, 500 new edge(s).',
      newViolations: titles.map((title) => ({ title })),
      removedViolations: [],
      newFindings: titles.map((title) => ({ title })),
      removedFindings: [],
      graphDelta: {
        newEdges: Array.from({ length: 500 }, () => ({})),
        removedEdges: Array.from({ length: 500 }, () => ({})),
        newNodes: Array.from({ length: 500 }, () => ({})),
        removedNodes: Array.from({ length: 500 }, () => ({})),
      },
      scope: {
        taskLinked: true,
        plannedFiles: ['src/planned.ts'],
        changedFiles: Array.from({ length: 100 }, (_, index) => `src/changed-${index}.ts`),
        deletedFiles: [],
        outOfScopeFiles: Array.from({ length: 100 }, (_, index) => `src/out-${index}.ts`),
        omittedGraphDelta: { newEdges: 1_000, removedEdges: 20, newNodes: 500, removedNodes: 5 },
      },
      riskDelta: { blastRadius: {} },
      recommendations: titles,
      missingTests: [],
      baselineSnapshotId: 'scan_old',
    } as unknown as ValidateDiffOutput

    const text = formatValidateDiffText(output)

    expect(text).toContain('task_2026-07-24_fd2fb03e')
    expect(text).toContain('100 outside prepared task')
    expect(text).toContain('…and 90 more')
    expect(Buffer.byteLength(text, 'utf8')).toBeLessThan(8_192)
  })
})
