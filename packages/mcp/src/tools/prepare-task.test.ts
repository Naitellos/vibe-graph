import { describe, expect, it, vi } from 'vitest'

vi.mock('@codearch/core', async (orig) => {
  const actual = await orig<typeof import('@codearch/core')>()
  return { ...actual, prepareTask: vi.fn(), writeTaskSession: vi.fn() }
})

import {
  type LoadedSnapshot,
  type PrepareTaskOutput,
  type SnapshotReader,
  TaskError,
  prepareTask,
  writeTaskSession,
} from '@codearch/core'
import { ToolError } from '../errors.js'
import { PrepareTaskTool } from './prepare-task.js'

// ---- fixture helpers --------------------------------------------------------

const makeSnapshot = () =>
  ({
    raw: {
      meta: {
        projectRoot: '/tmp/x',
        scanId: 'scan-001',
      },
    },
  }) as unknown as LoadedSnapshot

const makeReader = (snapshot = makeSnapshot()): SnapshotReader => ({
  get: vi.fn().mockResolvedValue(snapshot),
  invalidate: vi.fn(),
})

const baseInput = {
  intent: 'refactor payments',
  paths: ['server/services/payment.ts'],
  mode: 'refactor' as const,
}

const makeOutput = () => ({
  taskId: 'task_2026-05-28_abcd1234',
  createdAt: '2026-05-28T00:00:00.000Z',
  target: { subsystems: ['payments'], files: ['server/services/payment.ts'] },
  summary: 'Working on payments (1 transitive dependents, 0 active findings).',
  risks: [],
  rules: [],
  doNotDo: [],
  requiredContext: { files: [], schemaTables: [], relatedAdrs: [] },
  recommendations: [],
  tests: [],
  baselineSnapshotId: 'scan-001',
})

// ---- tests ------------------------------------------------------------------

describe('PrepareTaskTool wrapper', () => {
  it('TaskError is rewrapped as ToolError with matching code/message/hint', async () => {
    vi.mocked(prepareTask).mockRejectedValue(
      new TaskError(
        'TARGET_NOT_FOUND',
        'NO_MATCHING_SUBSYSTEM: None of the paths matched any subsystem: unrelated/file.ts.',
        'Check available subsystems via get_project_overview',
      ),
    )
    const reader = makeReader()

    await expect(
      PrepareTaskTool.handler(baseInput, { reader, projectRoot: '/tmp/test' }),
    ).rejects.toSatisfy((err: unknown) => {
      expect(err).toBeInstanceOf(ToolError)
      const toolErr = err as ToolError
      expect(toolErr.code).toBe('TARGET_NOT_FOUND')
      expect(toolErr.message).toContain('NO_MATCHING_SUBSYSTEM')
      expect(toolErr.hint).toBe('Check available subsystems via get_project_overview')
      return true
    })
  })

  it('on success: returns PrepareTaskOutput and persists TaskSession', async () => {
    const output = makeOutput()
    vi.mocked(prepareTask).mockResolvedValue(output as PrepareTaskOutput)
    vi.mocked(writeTaskSession).mockResolvedValue(undefined)
    const snapshot = makeSnapshot()
    const reader = makeReader(snapshot)

    const result = await PrepareTaskTool.handler(baseInput, { reader, projectRoot: '/tmp/test' })

    expect(result).toBe(output)
    expect(writeTaskSession).toHaveBeenCalledOnce()
    expect(writeTaskSession).toHaveBeenCalledWith(snapshot.raw.meta.projectRoot, {
      taskId: output.taskId,
      intent: baseInput.intent,
      paths: baseInput.paths,
      mode: baseInput.mode,
      baselineSnapshotId: output.baselineSnapshotId,
      createdAt: output.createdAt,
    })
  })

  it('persistence failure is non-fatal: resolves result even when writeTaskSession rejects', async () => {
    const output = makeOutput()
    vi.mocked(prepareTask).mockResolvedValue(output as PrepareTaskOutput)
    vi.mocked(writeTaskSession).mockRejectedValue(new Error('disk full'))
    const reader = makeReader()

    const result = await PrepareTaskTool.handler(baseInput, { reader, projectRoot: '/tmp/test' })

    expect(result).toBe(output)
  })

  it('non-TaskError propagates unwrapped', async () => {
    const raw = new Error('unexpected boom')
    vi.mocked(prepareTask).mockRejectedValue(raw)
    const reader = makeReader()

    await expect(
      PrepareTaskTool.handler(baseInput, { reader, projectRoot: '/tmp/test' }),
    ).rejects.toBe(raw)
    await expect(
      PrepareTaskTool.handler(baseInput, { reader, projectRoot: '/tmp/test' }),
    ).rejects.not.toBeInstanceOf(ToolError)
  })
})
