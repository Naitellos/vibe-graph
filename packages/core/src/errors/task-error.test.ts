import { describe, expect, it } from 'vitest'
import { TaskError, type TaskErrorCode } from './task-error.js'

describe('TaskError', () => {
  it('carries code, message, hint', () => {
    const err = new TaskError(
      'TARGET_NOT_FOUND',
      'no subsystem matches',
      'Run get_project_overview',
    )
    expect(err.code).toBe('TARGET_NOT_FOUND')
    expect(err.message).toBe('no subsystem matches')
    expect(err.hint).toBe('Run get_project_overview')
    expect(err.name).toBe('TaskError')
    expect(err).toBeInstanceOf(Error)
  })

  it('hint is optional', () => {
    const err = new TaskError('SNAPSHOT_MISSING', 'no snapshot')
    expect(err.hint).toBeUndefined()
  })

  it('TaskErrorCode union accepts known codes', () => {
    const codes: TaskErrorCode[] = ['TARGET_NOT_FOUND', 'SNAPSHOT_MISSING', 'INVALID_INPUT']
    expect(codes).toHaveLength(3)
  })
})
