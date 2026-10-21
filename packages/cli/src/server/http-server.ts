import { type IncomingMessage, type Server, type ServerResponse, createServer } from 'node:http'
import type { Logger } from 'pino'
import { resolveRoute } from './router.js'
import type { RouteContext } from './types.js'

export interface CreateHttpServerOptions {
  ctx: RouteContext
  log?: Logger
}

export interface HttpServerHandle {
  server: Server
  /** Resolved on `listening`. Returns the actual port (relevant when port: 0). */
  listen(port: number): Promise<{ port: number }>
  close(): Promise<void>
}

/**
 * Build an HTTP server wrapping the route dispatcher.
 *
 * Wire only — does NOT start listening. Caller invokes `handle.listen(port)`.
 * Each request:
 *   1. Parse URL into pathname + query
 *   2. For POST, buffer body, JSON-parse it
 *   3. Dispatch via resolveRoute
 *   4. Serialize RouteResponse as JSON + appropriate headers
 *   5. Catch all errors → 500 with sanitized message
 */
export function createHttpServer(opts: CreateHttpServerOptions): HttpServerHandle {
  const server = createServer((req, res) => {
    void handleRequest(req, res, opts)
  })

  return {
    server,
    async listen(port: number): Promise<{ port: number }> {
      return new Promise((resolveFn, rejectFn) => {
        server.once('error', rejectFn)
        server.listen(port, () => {
          const address = server.address()
          if (address === null || typeof address === 'string') {
            rejectFn(new Error('server.address() returned invalid value'))
            return
          }
          resolveFn({ port: address.port })
        })
      })
    },
    async close(): Promise<void> {
      return new Promise((resolveFn, rejectFn) => {
        server.close((err) => {
          if (err !== undefined) rejectFn(err)
          else resolveFn()
        })
      })
    },
  }
}

async function handleRequest(
  req: IncomingMessage,
  res: ServerResponse,
  opts: CreateHttpServerOptions,
): Promise<void> {
  try {
    const url = new URL(req.url ?? '/', `http://${req.headers.host ?? 'localhost'}`)
    const handler = resolveRoute(req.method ?? 'GET', url.pathname)
    if (handler === null) {
      sendResponse(res, 404, {
        error: 'NOT_FOUND',
        message: `No route for ${req.method} ${url.pathname}`,
      })
      return
    }

    const isPost = req.method === 'POST'
    const body = isPost ? await readJsonBody(req) : undefined

    const response = await handler(opts.ctx, {
      method: isPost ? 'POST' : 'GET',
      pathname: url.pathname,
      query: url.searchParams,
      body,
    })

    sendResponse(res, response.status, response.body, response.headers)
  } catch (err) {
    opts.log?.error?.({ err }, 'http: handler crashed')
    if (!res.headersSent) {
      sendResponse(res, 500, {
        error: 'INTERNAL_ERROR',
        message: err instanceof Error ? err.message : String(err),
      })
    } else {
      res.end()
    }
  }
}

function sendResponse(
  res: ServerResponse,
  status: number,
  body: unknown,
  extraHeaders?: Record<string, string>,
): void {
  res.statusCode = status

  // Apply extra headers first; track content-type if caller supplied one
  let contentType: string | undefined
  if (extraHeaders !== undefined) {
    for (const [k, v] of Object.entries(extraHeaders)) {
      if (k.toLowerCase() === 'content-type') contentType = v
      res.setHeader(k, v)
    }
  }

  if (body instanceof Buffer) {
    // Binary body — serve as-is
    if (contentType === undefined) {
      res.setHeader('content-type', 'application/octet-stream')
    }
    res.setHeader('content-length', body.length.toString())
    res.end(body)
    return
  }

  if (typeof body === 'string') {
    // String body (e.g. HTML) — preserve as-is
    if (contentType === undefined) {
      res.setHeader('content-type', 'text/plain; charset=utf-8')
    }
    const buf = Buffer.from(body, 'utf-8')
    res.setHeader('content-length', buf.length.toString())
    res.end(buf)
    return
  }

  // JSON fallback
  const json = JSON.stringify(body)
  if (contentType === undefined) {
    res.setHeader('content-type', 'application/json; charset=utf-8')
  }
  res.setHeader('content-length', Buffer.byteLength(json).toString())
  res.end(json)
}

async function readJsonBody(req: IncomingMessage): Promise<unknown> {
  return new Promise((resolveFn, rejectFn) => {
    const chunks: Buffer[] = []
    req.on('data', (chunk: Buffer) => chunks.push(chunk))
    req.on('error', rejectFn)
    req.on('end', () => {
      if (chunks.length === 0) {
        resolveFn(undefined)
        return
      }
      const text = Buffer.concat(chunks).toString('utf-8')
      try {
        resolveFn(JSON.parse(text))
      } catch {
        // Treat malformed JSON as undefined body — routes handle missing args
        resolveFn(undefined)
      }
    })
  })
}
