import type { URLSearchParams } from 'node:url'
import type { SnapshotReader } from '@codearch/core'

export interface RouteRequest {
  method: 'GET' | 'POST'
  pathname: string
  query: URLSearchParams
  /** For POST routes — JSON-parsed body. Undefined for GET. */
  body?: unknown
}

export interface RouteResponse {
  status: number
  body: unknown
  headers?: Record<string, string>
}

export interface RouteContext {
  /** SnapshotReader for accessing the LoadedSnapshot. */
  reader: SnapshotReader
  /** Absolute project root (used by routes that need filesystem access, e.g. context-pack). */
  projectRoot: string
  /** Trigger a fresh scan (used by POST /api/scan). */
  triggerScan: () => Promise<void>
}

export type RouteHandler = (ctx: RouteContext, req: RouteRequest) => Promise<RouteResponse>
