import { readActivityEntries } from '../activity/reader.js'
import type { RouteHandler, RouteResponse } from '../types.js'

const DEFAULT_LIMIT = 200
const MAX_LIMIT = 1000

export const agentActivityRoute: RouteHandler = async (ctx, req): Promise<RouteResponse> => {
  const sinceRaw = req.query.get('since')
  const limitRaw = req.query.get('limit')
  const since = sinceRaw !== null ? Number(sinceRaw) : null
  let limit = limitRaw !== null ? Number(limitRaw) : DEFAULT_LIMIT
  if (!Number.isFinite(limit) || limit <= 0) limit = DEFAULT_LIMIT
  if (limit > MAX_LIMIT) limit = MAX_LIMIT
  const { entries: all } = readActivityEntries(ctx.projectRoot)
  const entries = since !== null ? all.filter((e) => e.ts > since) : all
  return { status: 200, body: { entries: entries.slice(-limit) } }
}
