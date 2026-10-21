import { cpSync, existsSync, mkdtempSync, realpathSync } from 'node:fs'
import { rm } from 'node:fs/promises'
import { tmpdir } from 'node:os'
import { dirname, join, resolve } from 'node:path'
import { fileURLToPath } from 'node:url'
import { pino } from 'pino'
import { afterEach, describe, expect, it } from 'vitest'
import { startCockpit } from './cockpit.js'

const __dirname = dirname(fileURLToPath(import.meta.url))
const repoRoot = resolve(__dirname, '../../../..')
const fixtureSrc = join(repoRoot, 'fixtures/synthetic/simple-cycle')

function mkTmp(): string {
  return realpathSync(mkdtempSync(join(tmpdir(), 'vg-cockpit-')))
}

const toCleanup: string[] = []

afterEach(async () => {
  for (const dir of toCleanup.splice(0)) {
    if (existsSync(dir)) await rm(dir, { recursive: true, force: true })
  }
})

const silentLog = pino({ level: 'silent' })

describe('startCockpit', () => {
  it('scans on cold start (no graph.json) and binds an HTTP server', async () => {
    const workDir = mkTmp()
    toCleanup.push(workDir)
    cpSync(fixtureSrc, workDir, { recursive: true })

    let opened: string | null = null
    const handle = await startCockpit({
      projectRoot: workDir,
      port: 0, // ephemeral port
      noOpen: false,
      rescan: false,
      log: silentLog,
      openFn: async (url) => {
        opened = url
      },
    })

    try {
      expect(handle.port).toBeGreaterThan(0)
      expect(handle.url).toBe(`http://localhost:${handle.port}`)
      expect(opened).toBe(handle.url)
      // graph.json was created by the cold scan
      expect(existsSync(join(workDir, '.vibegraph/cache/graph.json'))).toBe(true)

      // Health endpoint responds
      const resp = await fetch(`${handle.url}/api/health`)
      expect(resp.status).toBe(200)
      const body = (await resp.json()) as { ok: boolean }
      expect(body.ok).toBe(true)
    } finally {
      await handle.stop()
    }
  }, 60_000)

  it('--no-open does not call openFn', async () => {
    const workDir = mkTmp()
    toCleanup.push(workDir)
    cpSync(fixtureSrc, workDir, { recursive: true })

    let opened: string | null = null
    const handle = await startCockpit({
      projectRoot: workDir,
      port: 0,
      noOpen: true,
      rescan: false,
      log: silentLog,
      openFn: async (url) => {
        opened = url
      },
    })

    try {
      expect(opened).toBe(null)
    } finally {
      await handle.stop()
    }
  }, 60_000)

  it('skips scan when graph.json exists and --rescan is false', async () => {
    const workDir = mkTmp()
    toCleanup.push(workDir)
    cpSync(fixtureSrc, workDir, { recursive: true })

    // Pre-create graph.json so cold-start scan is skipped
    const { scan, writeSnapshotAtomic } = await import('@codearch/core')
    const initialSnap = await scan({ root: workDir })
    const graphPath = join(workDir, '.vibegraph/cache/graph.json')
    await writeSnapshotAtomic(graphPath, initialSnap)

    const handle = await startCockpit({
      projectRoot: workDir,
      port: 0,
      noOpen: true,
      rescan: false,
      log: silentLog,
      openFn: async () => {},
    })
    let scanStartEvents = 0
    handle.bus.subscribe((e) => {
      if (e.type === 'scan:start') scanStartEvents++
    })

    try {
      // No fresh scan should have fired (graph already valid)
      expect(scanStartEvents).toBe(0)
      // /api/snapshot returns the pre-existing snapshot
      const resp = await fetch(`${handle.url}/api/snapshot`)
      const body = (await resp.json()) as { meta: { scanId: string } }
      expect(body.meta.scanId).toBe(initialSnap.meta.scanId)
    } finally {
      await handle.stop()
    }
  }, 90_000)

  it('--rescan forces scan even when graph.json exists', async () => {
    const workDir = mkTmp()
    toCleanup.push(workDir)
    cpSync(fixtureSrc, workDir, { recursive: true })

    const { scan, writeSnapshotAtomic } = await import('@codearch/core')
    const initial = await scan({ root: workDir })
    await writeSnapshotAtomic(join(workDir, '.vibegraph/cache/graph.json'), initial)

    const handle = await startCockpit({
      projectRoot: workDir,
      port: 0,
      noOpen: true,
      rescan: true,
      log: silentLog,
      openFn: async () => {},
    })

    try {
      const resp = await fetch(`${handle.url}/api/snapshot`)
      const body = (await resp.json()) as { meta: { scanId: string } }
      // Fresh scan → different scanId
      expect(body.meta.scanId).not.toBe(initial.meta.scanId)
    } finally {
      await handle.stop()
    }
  }, 90_000)

  it('WS client receives scan:complete event when triggerScan runs (via POST /api/scan)', async () => {
    const workDir = mkTmp()
    toCleanup.push(workDir)
    cpSync(fixtureSrc, workDir, { recursive: true })

    // Start cockpit with a pre-existing graph so the initial scan is skipped
    const { scan: coreScan, writeSnapshotAtomic } = await import('@codearch/core')
    const initial = await coreScan({ root: workDir })
    await writeSnapshotAtomic(join(workDir, '.vibegraph/cache/graph.json'), initial)

    const handle = await startCockpit({
      projectRoot: workDir,
      port: 0,
      noOpen: true,
      rescan: false,
      log: silentLog,
      openFn: async () => {},
    })

    try {
      // Connect WS client
      const { WebSocket } = await import('ws')
      const client = new WebSocket(`ws://localhost:${handle.port}/ws`)
      const messages: Array<{ type: string }> = []
      client.on('message', (data: Buffer) => {
        messages.push(JSON.parse(data.toString('utf-8')) as { type: string })
      })
      await new Promise<void>((resolveFn, rejectFn) => {
        client.once('open', () => resolveFn())
        client.once('error', rejectFn)
      })

      // Trigger a scan via POST /api/scan
      const resp = await fetch(`${handle.url}/api/scan`, { method: 'POST' })
      expect(resp.status).toBe(200)

      // Wait briefly for WS delivery
      await new Promise<void>((r) => setTimeout(r, 200))

      const types = messages.map((m) => m.type)
      expect(types).toContain('scan:start')
      expect(types).toContain('scan:complete')
      expect(types).toContain('graph:updated')
      client.close()
    } finally {
      await handle.stop()
    }
  }, 120_000)
})
