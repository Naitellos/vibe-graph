import { mkdirSync, mkdtempSync, rmSync, writeFileSync } from 'node:fs'
import { tmpdir } from 'node:os'
import { join } from 'node:path'
import { URLSearchParams } from 'node:url'
import type { ActivityEntry } from '@codearch/core'
import { afterEach, beforeEach, expect, it } from 'vitest'
import type { RouteContext, RouteRequest } from '../types.js'
import { agentActivityRoute } from './agent-activity.js'

let tmpRoot: string
beforeEach(() => {
  tmpRoot = mkdtempSync(join(tmpdir(), 'vg-aa-route-'))
  mkdirSync(join(tmpRoot, '.vibegraph/cache'), { recursive: true })
})
afterEach(() => rmSync(tmpRoot, { recursive: true, force: true }))

function entry(id: string, ts: number): ActivityEntry {
  return {
    id,
    ts,
    tool: 'x',
    durationMs: 0,
    status: 'ok',
    argsRedacted: '{}',
    redactions: 0,
    truncated: false,
  }
}

function writeLog(entries: ActivityEntry[]): void {
  writeFileSync(
    join(tmpRoot, '.vibegraph/cache/agent-activity.ndjson'),
    `${entries.map((e) => JSON.stringify(e)).join('\n')}\n`,
  )
}

function makeCtx(): RouteContext {
  return { projectRoot: tmpRoot } as unknown as RouteContext
}

function makeReq(url: string): RouteRequest {
  const { searchParams, pathname } = new URL(url, 'http://localhost')
  return { method: 'GET', pathname, query: searchParams } as RouteRequest
}

it('returns {entries:[]} when log file missing', async () => {
  const res = await agentActivityRoute(makeCtx(), makeReq('/api/agent-activity'))
  expect(res.status).toBe(200)
  expect(res.body).toEqual({ entries: [] })
})
it('returns all entries when no since/limit', async () => {
  writeLog([entry('a', 1), entry('b', 2), entry('c', 3)])
  const res = await agentActivityRoute(makeCtx(), makeReq('/api/agent-activity'))
  expect((res.body as { entries: ActivityEntry[] }).entries.map((e) => e.id)).toEqual([
    'a',
    'b',
    'c',
  ])
})
it('filters entries by ?since=<ts>', async () => {
  writeLog([entry('a', 1), entry('b', 2), entry('c', 3)])
  const res = await agentActivityRoute(makeCtx(), makeReq('/api/agent-activity?since=1'))
  expect((res.body as { entries: ActivityEntry[] }).entries.map((e) => e.id)).toEqual(['b', 'c'])
})
it('slices to last N when ?limit=N', async () => {
  writeLog([entry('a', 1), entry('b', 2), entry('c', 3), entry('d', 4)])
  const res = await agentActivityRoute(makeCtx(), makeReq('/api/agent-activity?limit=2'))
  expect((res.body as { entries: ActivityEntry[] }).entries.map((e) => e.id)).toEqual(['c', 'd'])
})
it('caps limit at 1000', async () => {
  writeLog([entry('a', 1)])
  const res = await agentActivityRoute(makeCtx(), makeReq('/api/agent-activity?limit=99999'))
  expect(res.status).toBe(200)
})
