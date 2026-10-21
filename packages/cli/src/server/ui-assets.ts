import { existsSync } from 'node:fs'
import { readFile } from 'node:fs/promises'
import { dirname, join, resolve } from 'node:path'
import { fileURLToPath } from 'node:url'
import type { RouteHandler, RouteResponse } from './types.js'

const PLACEHOLDER_HTML = `<!DOCTYPE html>
<html lang="en">
  <head>
    <meta charset="utf-8">
    <title>Vibe Graph (UI not built)</title>
    <style>
      body { font-family: system-ui, sans-serif; max-width: 640px; margin: 4em auto; padding: 0 1em; color: #222; }
      h1 { color: #5a4fcf; }
      code { background: #f4f4f8; padding: 0.15em 0.4em; border-radius: 3px; }
      pre { background: #f4f4f8; padding: 1em; border-radius: 5px; overflow: auto; }
      a { color: #5a4fcf; }
    </style>
  </head>
  <body>
    <h1>Vibe Graph cockpit</h1>
    <p>The UI bundle is not yet available. The Vibe Graph backend is running fine — the API endpoints under <a href="/api/health">/api/</a> are live.</p>
    <p>To build the UI, run:</p>
    <pre>pnpm --filter @codearch/ui build</pre>
    <p>Then restart the cockpit. Available API endpoints:</p>
    <ul>
      <li><a href="/api/health">/api/health</a></li>
      <li><a href="/api/overview">/api/overview</a></li>
      <li><a href="/api/snapshot">/api/snapshot</a></li>
      <li><a href="/api/findings">/api/findings</a></li>
    </ul>
  </body>
</html>
`

/**
 * Locate the bundled UI directory.
 *
 * In production (the CLI is installed): `dist/ui/` lives ALONGSIDE the cli's
 * `dist/bin.js`. We resolve it relative to import.meta.url.
 *
 * In development: there's no bundled UI yet — return null to fall back to the
 * placeholder.
 */
export function resolveUiDir(): string | null {
  try {
    const here = dirname(fileURLToPath(import.meta.url))
    // In the bundled CLI: dist/ui/ next to dist/bin.js
    const candidate = resolve(here, 'ui')
    if (existsSync(join(candidate, 'index.html'))) return candidate
    // Or under packages/ui/dist (when running from monorepo dev mode)
    const dev = resolve(here, '../../ui/dist')
    if (existsSync(join(dev, 'index.html'))) return dev
    return null
  } catch {
    return null
  }
}

const CONTENT_TYPES: Record<string, string> = {
  '.html': 'text/html; charset=utf-8',
  '.js': 'application/javascript; charset=utf-8',
  '.mjs': 'application/javascript; charset=utf-8',
  '.css': 'text/css; charset=utf-8',
  '.json': 'application/json; charset=utf-8',
  '.svg': 'image/svg+xml',
  '.png': 'image/png',
  '.jpg': 'image/jpeg',
  '.jpeg': 'image/jpeg',
  '.gif': 'image/gif',
  '.webp': 'image/webp',
  '.ico': 'image/x-icon',
  '.woff': 'font/woff',
  '.woff2': 'font/woff2',
  '.ttf': 'font/ttf',
  '.map': 'application/json; charset=utf-8',
}

function contentTypeFor(filename: string): string {
  const dot = filename.lastIndexOf('.')
  if (dot < 0) return 'application/octet-stream'
  const ext = filename.slice(dot).toLowerCase()
  return CONTENT_TYPES[ext] ?? 'application/octet-stream'
}

/** Returns true if `relPath` does not try to escape via `..` or absolute. */
function isSafeRelPath(relPath: string): boolean {
  if (relPath.length === 0) return true
  if (relPath.startsWith('/') || relPath.startsWith('\\')) return false
  if (relPath.includes('..')) return false
  return true
}

/**
 * Serve the UI root (GET /) — index.html if available, placeholder otherwise.
 */
export const uiRootRoute: RouteHandler = async (): Promise<RouteResponse> => {
  const uiDir = resolveUiDir()
  if (uiDir === null) {
    return {
      status: 200,
      body: PLACEHOLDER_HTML,
      headers: { 'content-type': 'text/html; charset=utf-8' },
    }
  }
  try {
    const html = await readFile(join(uiDir, 'index.html'), 'utf-8')
    return {
      status: 200,
      body: html,
      headers: { 'content-type': 'text/html; charset=utf-8' },
    }
  } catch {
    // Fall back to placeholder if read fails
    return {
      status: 200,
      body: PLACEHOLDER_HTML,
      headers: { 'content-type': 'text/html; charset=utf-8' },
    }
  }
}

/**
 * Serve a file under /assets/*. Path traversal-safe; falls through to 404 when
 * the UI dir doesn't exist OR the requested file is absent.
 *
 * The request pathname is `/assets/foo.js` → relPath `assets/foo.js`.
 */
export const uiAssetsRoute: RouteHandler = async (_ctx, req): Promise<RouteResponse> => {
  // Strip leading slash and validate path BEFORE checking uiDir — path traversal
  // is always rejected regardless of whether the UI bundle is present.
  const relPath = req.pathname.startsWith('/') ? req.pathname.slice(1) : req.pathname
  if (!isSafeRelPath(relPath)) {
    return { status: 400, body: { error: 'BAD_REQUEST', message: 'invalid path' } }
  }

  const uiDir = resolveUiDir()
  if (uiDir === null) {
    return { status: 404, body: { error: 'UI_NOT_BUILT', message: 'UI bundle not available' } }
  }
  const absPath = join(uiDir, relPath)
  // Defense-in-depth: ensure the resolved absolute path is inside uiDir
  if (!absPath.startsWith(`${uiDir}/`) && absPath !== uiDir) {
    return { status: 400, body: { error: 'BAD_REQUEST', message: 'path escape attempt' } }
  }
  try {
    const content = await readFile(absPath)
    return {
      status: 200,
      body: content,
      headers: { 'content-type': contentTypeFor(absPath) },
    }
  } catch {
    return { status: 404, body: { error: 'NOT_FOUND', message: `asset ${relPath} not found` } }
  }
}
