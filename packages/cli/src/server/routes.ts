import {
  buildContextPack,
  computeBlastRadius,
  createIgnoreMatcher,
  loadSubsystemDocs,
  resolveTarget,
  writeBaselineEntry,
} from '@codearch/core'
import { agentActivityRoute } from './routes/agent-activity.js'
import { prepareTaskRoute } from './routes/prepare-task.js'
import { validateDiffRoute } from './routes/validate-diff.js'
import type { RouteContext, RouteHandler, RouteRequest, RouteResponse } from './types.js'
import { uiAssetsRoute, uiRootRoute } from './ui-assets.js'

export { uiAssetsRoute }
export { agentActivityRoute }
export { prepareTaskRoute }
export { validateDiffRoute }

// ─── GET /api/health ──────────────────────────────────────────────────────────
export const healthRoute: RouteHandler = async () => ({
  status: 200,
  body: { ok: true, version: '0.0.0' },
})

// ─── GET /api/snapshot ────────────────────────────────────────────────────────
export const snapshotRoute: RouteHandler = async (ctx) => {
  const loaded = await ctx.reader.get()
  return { status: 200, body: loaded.raw }
}

// ─── GET /api/overview ────────────────────────────────────────────────────────
// Returns counts + topFindings + topHubs (mirrors mcp's get_project_overview).
export const overviewRoute: RouteHandler = async (ctx) => {
  const loaded = await ctx.reader.get()
  const snap = loaded.raw
  return {
    status: 200,
    body: {
      project: {
        name: snap.meta.projectName,
        root: snap.meta.projectRoot,
        snapshotBuiltAt: snap.meta.builtAt,
        snapshotScanId: snap.meta.scanId,
      },
      counts: {
        subsystems: snap.nodes.filter((n) => n.kind === 'subsystem').length,
        files: snap.nodes.filter((n) => n.kind === 'file').length,
        edges: snap.edges.length,
        findings: snap.findings.length,
        externalPackages: snap.nodes.filter((n) => n.kind === 'external').length,
      },
    },
  }
}

// ─── GET /api/findings?domain&severity&status ─────────────────────────────────
export const findingsRoute: RouteHandler = async (ctx, req) => {
  const loaded = await ctx.reader.get()
  const domain = req.query.get('domain')
  const severity = req.query.get('severity')
  const status = req.query.get('status')

  let findings = loaded.raw.findings
  if (domain !== null) findings = findings.filter((f) => f.domain === domain)
  if (severity !== null) findings = findings.filter((f) => f.severity === severity)
  if (status !== null) findings = findings.filter((f) => f.status === status)

  return { status: 200, body: { findings } }
}

// ─── GET /api/node?id= ────────────────────────────────────────────────────────
export const nodeRoute: RouteHandler = async (ctx, req) => {
  const id = req.query.get('id')
  if (id === null || id.length === 0) {
    return badRequest('id query param required')
  }
  const loaded = await ctx.reader.get()
  const node = loaded.nodesById.get(id)
  if (node === undefined) {
    return notFound(`node '${id}' not found`)
  }
  // Include outgoing + incoming dep edges for the UI
  const outgoing = (loaded.edgesByNodeId.get(id) ?? []).slice()
  const incoming = (loaded.edgesByTargetId.get(id) ?? []).slice()
  return { status: 200, body: { node, outgoing, incoming } }
}

// ─── GET /api/blast-radius?target&maxDepth ────────────────────────────────────
export const blastRadiusRoute: RouteHandler = async (ctx, req) => {
  const target = req.query.get('target')
  if (target === null || target.length === 0) {
    return badRequest('target query param required')
  }
  const maxDepth = parsePositiveInt(req.query.get('maxDepth'), 5)
  if (maxDepth === null) {
    return badRequest('maxDepth must be a positive integer')
  }
  const loaded = await ctx.reader.get()
  const resolved = resolveTarget(loaded, target)
  if ('error' in resolved) {
    return {
      status: resolved.error === 'AMBIGUOUS' ? 409 : 404,
      body: { error: resolved.error, candidates: resolved.candidates },
    }
  }
  const radius = computeBlastRadius(loaded, resolved.id, { maxDepth })
  return {
    status: 200,
    body: {
      target: { nodeId: resolved.id, title: resolved.title, kind: resolved.kind },
      ...radius,
    },
  }
}

// ─── GET /api/context-pack?target&maxTokens ───────────────────────────────────
export const contextPackRoute: RouteHandler = async (ctx, req) => {
  const target = req.query.get('target')
  if (target === null || target.length === 0) {
    return badRequest('target query param required')
  }
  const maxTokens = parsePositiveInt(req.query.get('maxTokens'), 8000)
  const maxFiles = parsePositiveInt(req.query.get('maxFiles'), 10)
  if (maxTokens === null || maxFiles === null) {
    return badRequest('maxTokens and maxFiles must be positive integers')
  }
  const loaded = await ctx.reader.get()
  const resolved = resolveTarget(loaded, target)
  if ('error' in resolved) {
    return {
      status: resolved.error === 'AMBIGUOUS' ? 409 : 404,
      body: { error: resolved.error, candidates: resolved.candidates },
    }
  }
  const ignore = createIgnoreMatcher({ patterns: [], includeDefaults: true })
  const pack = await buildContextPack(loaded, {
    target: resolved.id,
    maxTokens,
    maxFiles,
    projectRoot: ctx.projectRoot,
    ignore,
  })
  return { status: 200, body: pack }
}

// ─── GET /api/evidence?id= ────────────────────────────────────────────────────
export const evidenceRoute: RouteHandler = async (ctx, req) => {
  const id = req.query.get('id')
  if (id === null || id.length === 0) {
    return badRequest('id query param required')
  }
  const loaded = await ctx.reader.get()
  const ev = loaded.evidenceById.get(id)
  if (ev === undefined) {
    return notFound(`evidence '${id}' not found`)
  }
  return { status: 200, body: ev }
}

// ─── GET /api/search?q= ───────────────────────────────────────────────────────
export const searchRoute: RouteHandler = async (ctx, req) => {
  const q = req.query.get('q')
  if (q === null || q.length === 0) {
    return badRequest('q query param required')
  }
  const loaded = await ctx.reader.get()
  const lcQuery = q.toLowerCase()
  const nodes = [...loaded.nodesById.values()]
    .filter((n) => n.id.toLowerCase().includes(lcQuery) || n.title.toLowerCase().includes(lcQuery))
    .slice(0, 50)
    .map((n) => ({ id: n.id, kind: n.kind, title: n.title }))
  return { status: 200, body: { nodes } }
}

// ─── GET /api/subsystem-docs ──────────────────────────────────────────────────
export const subsystemDocsListRoute: RouteHandler = async (ctx) => {
  const { docs } = await loadSubsystemDocs(ctx.projectRoot)
  return { status: 200, body: { docs } }
}

// ─── GET /api/subsystem-docs/:slug ────────────────────────────────────────────
// slug is extracted from req.pathname: /api/subsystem-docs/<slug>
export const subsystemDocSlugRoute: RouteHandler = async (ctx, req) => {
  const prefix = '/api/subsystem-docs/'
  const slug = req.pathname.startsWith(prefix) ? req.pathname.slice(prefix.length) : ''
  if (slug.length === 0 || slug.includes('/')) {
    return badRequest('invalid slug')
  }

  const loaded = await ctx.reader.get()
  const subsystemNodeId = `subsystem:${slug}`
  const node = loaded.nodesById.get(subsystemNodeId)
  if (node === undefined) {
    return notFound(`subsystem '${slug}' not found`)
  }

  const { docs } = await loadSubsystemDocs(ctx.projectRoot)
  const doc = docs.find((d) => d.id === slug)

  // Compute AST-derived dependencies (exclude yaml-sourced edges)
  const astDependsOnSet = new Set<string>()
  const astConsumedBySet = new Set<string>()
  for (const e of loaded.raw.edges) {
    if (e.source === 'yaml') continue
    if (e.kind !== 'depends_on') continue
    if (!e.from.startsWith('subsystem:') || !e.to.startsWith('subsystem:')) continue
    if (e.from === subsystemNodeId) {
      astDependsOnSet.add(e.to.replace(/^subsystem:/, ''))
    }
    if (e.to === subsystemNodeId) {
      astConsumedBySet.add(e.from.replace(/^subsystem:/, ''))
    }
  }

  // Compute ownedFilesCount: count of 'contains' edges from this subsystem
  let ownedFilesCount = 0
  for (const e of loaded.raw.edges) {
    if (e.kind === 'contains' && e.from === subsystemNodeId) {
      ownedFilesCount++
    }
  }

  // Compute drift summary from findings involving this subsystem
  let driftOpen = 0
  let driftAccepted = 0
  let driftIgnored = 0
  for (const f of loaded.raw.findings) {
    if (f.domain !== 'drift') continue
    if (!f.involvedNodeIds.includes(subsystemNodeId)) continue
    if (f.status === 'accepted') {
      driftAccepted++
    } else if (f.status === 'ignored') {
      driftIgnored++
    } else {
      driftOpen++
    }
  }

  return {
    status: 200,
    body: {
      id: slug,
      title: doc?.title ?? node.title,
      layer: doc?.layer ?? node.layer ?? 'unknown',
      status: doc?.status ?? node.status ?? 'unknown',
      description: doc?.description ?? '',
      ...(doc?.last_verified !== undefined ? { lastVerified: doc.last_verified } : {}),
      ...(doc?.verified_by !== undefined ? { verifiedBy: doc.verified_by } : {}),
      match: doc?.match ?? [],
      declaredDependsOn: doc?.depends_on ?? [],
      declaredConsumedBy: doc?.consumed_by ?? [],
      astDependsOn: [...astDependsOnSet].sort(),
      astConsumedBy: [...astConsumedBySet].sort(),
      ownedFilesCount,
      schemaTables: doc?.schema_tables ?? [],
      relatedSpecs: doc?.related_specs ?? [],
      relatedDecisions: doc?.related_decisions ?? [],
      memoryRefs: doc?.memory_refs ?? [],
      driftSummary: { open: driftOpen, accepted: driftAccepted, ignored: driftIgnored },
    },
  }
}

// ─── POST /api/findings/:id/status ───────────────────────────────────────────
// id is extracted from req.pathname: /api/findings/<id>/status
export const findingStatusRoute: RouteHandler = async (ctx, req) => {
  // pathname pattern: /api/findings/<id>/status
  // Strip known prefix/suffix to extract id
  const afterPrefix = req.pathname.startsWith('/api/findings/')
    ? req.pathname.slice('/api/findings/'.length)
    : ''
  const findingId = afterPrefix.endsWith('/status')
    ? afterPrefix.slice(0, afterPrefix.length - '/status'.length)
    : ''
  if (findingId.length === 0 || findingId.includes('/')) {
    return badRequest('invalid finding id in path')
  }

  const body = req.body as Record<string, unknown> | undefined
  if (body === null || body === undefined || typeof body !== 'object') {
    return badRequest('request body required')
  }

  const rawStatus = body.status
  if (rawStatus !== 'accepted' && rawStatus !== 'ignored') {
    return badRequest("status must be 'accepted' or 'ignored'")
  }

  const rawNote = body.note
  const note = typeof rawNote === 'string' ? rawNote : undefined

  await writeBaselineEntry(ctx.projectRoot, { findingId, status: rawStatus, note })
  return { status: 200, body: { ok: true } }
}

// ─── POST /api/scan ───────────────────────────────────────────────────────────
export const scanRoute: RouteHandler = async (ctx) => {
  await ctx.triggerScan()
  // After scan completes, the reader's cached snapshot will pick up the new file.
  const loaded = await ctx.reader.get()
  return {
    status: 200,
    body: {
      ok: true,
      scanId: loaded.raw.meta.scanId,
      builtAt: loaded.raw.meta.builtAt,
      counts: {
        nodes: loaded.raw.nodes.length,
        edges: loaded.raw.edges.length,
        findings: loaded.raw.findings.length,
      },
    },
  }
}

// ─── Helpers ──────────────────────────────────────────────────────────────────

function badRequest(message: string): RouteResponse {
  return { status: 400, body: { error: 'BAD_REQUEST', message } }
}

function notFound(message: string): RouteResponse {
  return { status: 404, body: { error: 'NOT_FOUND', message } }
}

function parsePositiveInt(input: string | null, fallback: number): number | null {
  if (input === null || input === '') return fallback
  const n = Number(input)
  if (!Number.isInteger(n) || n <= 0) return null
  return n
}

// Re-export types so router.ts can re-export them from a single place
export type { RouteContext, RouteHandler, RouteRequest, RouteResponse } from './types.js'

// ─── Route map ────────────────────────────────────────────────────────────────

export const ROUTES: ReadonlyMap<string, { GET?: RouteHandler; POST?: RouteHandler }> = new Map([
  ['/', { GET: uiRootRoute }],
  // Favicon lives at the bundle root (vite copies public/ → dist root). uiAssetsRoute
  // resolves it from the UI dir by pathname, so a 404 is impossible-to-avoid only when
  // the UI isn't built.
  ['/favicon.svg', { GET: uiAssetsRoute }],
  ['/api/health', { GET: healthRoute }],
  ['/api/snapshot', { GET: snapshotRoute }],
  ['/api/overview', { GET: overviewRoute }],
  ['/api/findings', { GET: findingsRoute }],
  ['/api/node', { GET: nodeRoute }],
  ['/api/blast-radius', { GET: blastRadiusRoute }],
  ['/api/context-pack', { GET: contextPackRoute }],
  ['/api/evidence', { GET: evidenceRoute }],
  ['/api/search', { GET: searchRoute }],
  ['/api/scan', { POST: scanRoute }],
  ['/api/subsystem-docs', { GET: subsystemDocsListRoute }],
  ['/api/agent-activity', { GET: agentActivityRoute }],
  ['/api/prepare-task', { POST: prepareTaskRoute }],
  ['/api/validate-diff', { POST: validateDiffRoute }],
])

// ─── Prefix-based route handlers (exported for router.ts) ─────────────────────

/** Handler for GET /api/subsystem-docs/<slug> (prefix: /api/subsystem-docs/) */
export const subsystemDocsPrefixRoutes = {
  prefix: '/api/subsystem-docs/',
  GET: subsystemDocSlugRoute,
} as const

/** Handler for POST /api/findings/<id>/status (prefix: /api/findings/) */
export const findingsPrefixRoutes = {
  prefix: '/api/findings/',
  POST: findingStatusRoute,
} as const
