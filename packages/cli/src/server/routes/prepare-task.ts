import {
  type LoadedSnapshot,
  PrepareTaskInputSchema,
  TaskError,
  prepareTask,
  writeTaskSession,
} from '@codearch/core'
import type { RouteHandler, RouteResponse } from '../types.js'

export const prepareTaskRoute: RouteHandler = async (ctx, req): Promise<RouteResponse> => {
  const parsed = PrepareTaskInputSchema.safeParse(req.body) // req.body is already JSON-parsed
  if (!parsed.success) {
    return err(400, 'Invalid input', { details: parsed.error.issues })
  }

  let snapshot: LoadedSnapshot
  try {
    snapshot = await ctx.reader.get()
  } catch (e) {
    return err(500, `Snapshot not available: ${e instanceof Error ? e.message : String(e)}`)
  }

  try {
    const data = await prepareTask(parsed.data, { snapshot })
    try {
      await writeTaskSession(snapshot.raw.meta.projectRoot, {
        taskId: data.taskId,
        intent: parsed.data.intent,
        paths: parsed.data.paths,
        mode: parsed.data.mode,
        baselineSnapshotId: data.baselineSnapshotId,
        createdAt: data.createdAt,
      })
    } catch {
      // best-effort — session persistence failure must not fail the response (matches MCP wrapper)
    }
    return { status: 200, body: { ok: true, data } }
  } catch (e) {
    if (e instanceof TaskError) return err(500, e.message, { code: e.code })
    return err(500, e instanceof Error ? e.message : String(e))
  }
}

function err(status: number, error: string, extras: Record<string, unknown> = {}): RouteResponse {
  return { status, body: { ok: false, error, ...extras } }
}
