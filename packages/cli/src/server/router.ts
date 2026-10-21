import { ROUTES, findingsPrefixRoutes, subsystemDocsPrefixRoutes, uiAssetsRoute } from './routes.js'
import type { RouteHandler } from './types.js'

export type { RouteContext, RouteHandler, RouteRequest, RouteResponse } from './types.js'

/** Prefix-based routes — matched after exact routes, longest prefix wins implicitly. */
const PREFIX_ROUTES: ReadonlyArray<{ prefix: string; GET?: RouteHandler; POST?: RouteHandler }> = [
  { prefix: '/assets/', GET: uiAssetsRoute },
  subsystemDocsPrefixRoutes,
  findingsPrefixRoutes,
]

/**
 * Resolve a method+pathname to a handler. Returns null for 404.
 * Pure — no I/O, just dispatch logic.
 *
 * Dispatch order:
 *   1. Exact match in ROUTES
 *   2. Prefix match in PREFIX_ROUTES
 */
export function resolveRoute(method: string, pathname: string): RouteHandler | null {
  // Exact-match first
  const exact = ROUTES.get(pathname)
  if (exact !== undefined) {
    if (method === 'GET' && exact.GET !== undefined) return exact.GET
    if (method === 'POST' && exact.POST !== undefined) return exact.POST
  }
  // Prefix fall-through
  for (const route of PREFIX_ROUTES) {
    if (pathname.startsWith(route.prefix)) {
      if (method === 'GET' && route.GET !== undefined) return route.GET
      if (method === 'POST' && route.POST !== undefined) return route.POST
    }
  }
  return null
}
