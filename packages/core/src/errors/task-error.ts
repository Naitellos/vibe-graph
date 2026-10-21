export type TaskErrorCode =
  | 'TARGET_NOT_FOUND'
  | 'SNAPSHOT_MISSING'
  | 'INVALID_INPUT'
  | 'NO_BASELINE'
  | 'SNAPSHOT_STALE'

export class TaskError extends Error {
  readonly code: TaskErrorCode
  readonly hint?: string

  constructor(code: TaskErrorCode, message: string, hint?: string) {
    super(message)
    this.name = 'TaskError'
    this.code = code
    this.hint = hint
  }
}
