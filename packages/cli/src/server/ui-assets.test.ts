import { URLSearchParams } from 'node:url'
import type { SnapshotReader } from '@codearch/core'
import { describe, expect, it } from 'vitest'
import { uiAssetsRoute, uiRootRoute } from './ui-assets.js'

function stubCtx() {
  const reader: SnapshotReader = {
    get: async () => {
      throw new Error('not called in UI tests')
    },
    invalidate: () => {},
  }
  return { reader, projectRoot: '/abs', triggerScan: async () => {} }
}

const emptyReq = (path: string) => ({
  method: 'GET' as const,
  pathname: path,
  query: new URLSearchParams(),
})

describe('uiRootRoute', () => {
  it('returns 200 with HTML content-type', async () => {
    const r = await uiRootRoute(stubCtx(), emptyReq('/'))
    expect(r.status).toBe(200)
    expect(r.headers?.['content-type']).toContain('text/html')
  })

  it('placeholder includes "Vibe Graph" branding when UI not built', async () => {
    const r = await uiRootRoute(stubCtx(), emptyReq('/'))
    expect(typeof r.body).toBe('string')
    expect(r.body as string).toContain('Vibe Graph')
  })
})

describe('uiAssetsRoute', () => {
  it('404s when UI not built', async () => {
    const r = await uiAssetsRoute(stubCtx(), emptyReq('/assets/main.js'))
    expect(r.status).toBe(404)
  })

  it('rejects path traversal', async () => {
    const r = await uiAssetsRoute(stubCtx(), emptyReq('/assets/../etc/passwd'))
    expect(r.status).toBe(400)
  })
})
