import { describe, expect, it } from 'vitest'
import {
  PrepareTaskInputSchema,
  PrepareTaskOutputSchema,
  TaskSessionSchema,
} from './prepare-task.js'

describe('PrepareTaskInputSchema', () => {
  it('accepts a minimal input', () => {
    const parsed = PrepareTaskInputSchema.parse({
      intent: 'refactor payments',
      paths: ['server/services/payment.ts'],
      mode: 'refactor',
    })
    expect(parsed.mode).toBe('refactor')
  })

  it('defaults mode to refactor when omitted', () => {
    const parsed = PrepareTaskInputSchema.parse({
      intent: 'change something',
      paths: ['a.ts'],
    })
    expect(parsed.mode).toBe('refactor')
  })

  it('rejects empty paths', () => {
    expect(() =>
      PrepareTaskInputSchema.parse({ intent: 'x', paths: [], mode: 'refactor' }),
    ).toThrow()
  })

  it('rejects unknown mode', () => {
    expect(() =>
      PrepareTaskInputSchema.parse({ intent: 'x', paths: ['a.ts'], mode: 'invalid' }),
    ).toThrow()
  })
})

describe('PrepareTaskOutputSchema', () => {
  it('parses a complete output shape', () => {
    const parsed = PrepareTaskOutputSchema.parse({
      taskId: 'task_2026-05-27_abc',
      createdAt: '2026-05-27T00:00:00.000Z',
      target: { subsystems: ['payments'], files: ['server/services/payment.ts'] },
      summary: 'Working on payments',
      risks: [],
      rules: [],
      doNotDo: [],
      requiredContext: { files: [], schemaTables: [], relatedAdrs: [] },
      recommendations: [],
      tests: [],
      baselineSnapshotId: 'scan_abc',
    })
    expect(parsed.taskId).toBe('task_2026-05-27_abc')
  })
})

describe('TaskSessionSchema', () => {
  it('parses and serializes session record', () => {
    const session = TaskSessionSchema.parse({
      taskId: 'task_xyz',
      intent: 'rewrite oracle',
      paths: ['server/services/oracle.ts'],
      mode: 'refactor',
      baselineSnapshotId: 'scan_abc',
      createdAt: '2026-05-27T00:00:00.000Z',
    })
    expect(session.taskId).toBe('task_xyz')
    expect(session.mode).toBe('refactor')
  })
})
