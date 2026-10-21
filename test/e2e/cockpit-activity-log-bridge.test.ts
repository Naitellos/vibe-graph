// test/e2e/cockpit-activity-log-bridge.test.ts
//
// E2E: activity-log bridge — NDJSON append → tailer → WS broadcast + backfill route.
//
// Boot the cockpit server, append ActivityEntry lines to the log file, then assert:
//   (a) GET /api/agent-activity returns the appended entries (backfill route)
//   (b) A connected WS client at /ws receives a live `'activity'` broadcast
//
// The activity tailer calls mkdirSync(dirname(logPath), { recursive: true }) at
// start() before chokidar.watch(), so the cache directory always exists when the
// watcher starts — no preStart seeding needed even on a fresh project with no
// .vibegraph/cache directory yet.

import { appendFileSync } from 'node:fs'
import { join } from 'node:path'
import { type ActivityEntry, generateActivityEntryId } from '@codearch/core'
import { afterAll, beforeAll, expect, it } from 'vitest'
import { type ServerHandle, startCliServerInFixture, stopCliServer } from './helpers/cli-server.js'

let server: ServerHandle
beforeAll(async () => {
  // Use port 3219 to avoid colliding with cockpit-prepare-task-route.test.ts (3218).
  server = await startCliServerInFixture('fixtures/synthetic/rich-yaml', 3219)
}, 30_000)
afterAll(async () => {
  await stopCliServer(server)
})

function makeEntry(hint: string, ts: number): ActivityEntry {
  const argsJson = JSON.stringify({ hint, ts })
  return {
    id: generateActivityEntryId(ts, argsJson),
    ts,
    tool: 'prepare_task',
    durationMs: 7,
    status: 'ok',
    summary: 'fixture',
    argsRedacted: argsJson,
    redactions: 0,
    truncated: false,
  }
}

function logPath(): string {
  return join(server.projectRoot, '.vibegraph/cache/agent-activity.ndjson')
}

const sleep = (ms: number): Promise<void> => new Promise((r) => setTimeout(r, ms))

async function waitFor(condition: () => boolean, timeoutMs: number): Promise<void> {
  const start = Date.now()
  while (!condition() && Date.now() - start < timeoutMs) {
    await sleep(30)
  }
  if (!condition()) throw new Error(`waitFor timed out after ${timeoutMs}ms`)
}

it('backfill returns appended entries', async () => {
  appendFileSync(
    logPath(),
    `${JSON.stringify(makeEntry('a', 1_000))}\n${JSON.stringify(makeEntry('b', 2_000))}\n`,
  )
  // The HTTP route reads the file synchronously — no chokidar involved.
  // A short settle avoids flakiness on slow disks.
  await sleep(250)
  const res = await fetch(`${server.baseUrl}/api/agent-activity`)
  expect(res.status).toBe(200)
  const body = (await res.json()) as { entries: ActivityEntry[] }
  expect(body.entries.length).toBeGreaterThanOrEqual(2)
})

it('WS receives broadcast on new append', async () => {
  // WS path confirmed from packages/cli/src/server/ws-server.ts: default '/ws'.
  // cockpit.ts calls attachWebSocketServer({ httpServer, bus }) with no path override → '/ws'.
  const wsUrl = `${server.baseUrl.replace(/^http/, 'ws')}/ws`

  // Node 24 has a stable global WebSocket — no import needed.
  const ws = new WebSocket(wsUrl)
  const received: unknown[] = []

  await new Promise<void>((resolve, reject) => {
    ws.addEventListener('open', () => resolve())
    ws.addEventListener('error', () => reject(new Error('ws connection error')))
  })

  ws.addEventListener('message', (ev: MessageEvent) => {
    try {
      const parsed = JSON.parse(String(ev.data))
      if (parsed.type === 'activity') received.push(parsed)
    } catch {
      // ignore non-JSON frames
    }
  })

  appendFileSync(logPath(), `${JSON.stringify(makeEntry('live', Date.now()))}\n`)
  await waitFor(() => received.length > 0, 5_000)
  expect(received.length).toBeGreaterThanOrEqual(1)
  ws.close()
})
