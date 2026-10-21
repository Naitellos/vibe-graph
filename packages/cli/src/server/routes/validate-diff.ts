import { type LoadedSnapshot, toValidateDiffUiPayload, validateDiff } from '@codearch/core'
import type { RouteHandler, RouteResponse } from '../types.js'

export const validateDiffRoute: RouteHandler = async (ctx, req): Promise<RouteResponse> => {
  const body = (req.body ?? {}) as {
    taskId?: string
    workingFiles?: string[]
    diff?: string
  }
  let snapshot: LoadedSnapshot
  try {
    snapshot = await ctx.reader.get()
  } catch (e) {
    return err(
      500,
      `Snapshot not available: ${e instanceof Error ? e.message : String(e)}`,
      'SNAPSHOT_UNAVAILABLE',
    )
  }
  try {
    const output = await validateDiff(
      { taskId: body.taskId, workingFiles: body.workingFiles, diff: body.diff, mode: 'advisory' },
      { snapshot, projectRoot: ctx.projectRoot },
    )
    return { status: 200, body: { ok: true, data: toValidateDiffUiPayload(output) } }
  } catch (e) {
    const code = (e as { code?: string }).code
    const msg = e instanceof Error ? e.message : String(e)
    if (code === 'NO_BASELINE') return err(409, msg, 'NO_BASELINE')
    if (code === 'SNAPSHOT_STALE') return err(409, msg, 'SNAPSHOT_STALE')
    // TASK_SESSION_NOT_FOUND: taskId was given but no matching session found
    if (code === 'INVALID_INPUT' && msg.includes('TASK_SESSION_NOT_FOUND'))
      return err(404, msg, 'TASK_SESSION_NOT_FOUND')
    // Other INVALID_INPUT variants (GIT_NOT_AVAILABLE, WORKING_DIFF_TOO_LARGE) → 500
    if (code === 'INVALID_INPUT') return err(500, msg, 'SCAN_FAILED')
    return err(500, msg, 'SCAN_FAILED')
  }
}

function err(status: number, error: string, code: string): RouteResponse {
  return { status, body: { ok: false, error, code } }
}
