// test/e2e/cli-cockpit-drift-accept.test.ts
//
// E2E: POST /api/findings/<id>/status → 'accepted' persists across scan.
//
// Flow:
//   1. Copy drift-cases/stale-only fixture to a tmpdir.
//   2. Run `vibe-graph scan` → populates .vibegraph/cache/graph.json with a
//      stale drift finding (status = 'open').
//   3. Spawn `vibe-graph default --port <P> --no-open` as a subprocess.
//   4. Wait until the HTTP server responds 200 on /api/health.
//   5. POST /api/findings/<id>/status with { status: 'accepted' }.
//   6. Verify .vibegraph/drift-baseline.json was written with the accepted entry.
//   7. Kill the cockpit subprocess.
//   8. Re-run `vibe-graph scan`.
//   9. Verify the same finding has status = 'accepted' in the new snapshot.
//
// Note: build is handled in test/e2e/global-setup.ts

import { type ChildProcess, execFile, spawn } from 'node:child_process'
import { cp, mkdtemp, readFile, rm } from 'node:fs/promises'
import { tmpdir } from 'node:os'
import { dirname, join, resolve } from 'node:path'
import { fileURLToPath } from 'node:url'
import { promisify } from 'node:util'
import { afterAll, beforeAll, describe, expect, it } from 'vitest'

const execFileAsync = promisify(execFile)

const __dirname = dirname(fileURLToPath(import.meta.url))
const repoRoot = resolve(__dirname, '../..')
const binPath = join(repoRoot, 'packages/cli/dist/bin.js')
const fixtureSrc = join(repoRoot, 'fixtures/synthetic/drift-cases/stale-only')

// Use a fixed port unlikely to conflict; explicit so no fallback noise.
const COCKPIT_PORT = 3217

async function waitForReady(port: number, timeoutMs = 15_000): Promise<void> {
  const deadline = Date.now() + timeoutMs
  while (Date.now() < deadline) {
    try {
      const res = await fetch(`http://127.0.0.1:${port}/api/health`)
      if (res.ok) return
    } catch {
      // Server not yet up — swallow and retry
    }
    await new Promise<void>((r) => setTimeout(r, 200))
  }
  throw new Error(`Cockpit did not become ready on port ${port} within ${timeoutMs}ms`)
}

describe('E2E: cockpit drift accept persists across scan', () => {
  let workDir: string
  let cockpit: ChildProcess | null = null

  beforeAll(async () => {
    workDir = await mkdtemp(join(tmpdir(), 'vg-e2e-cockpit-drift-'))
    // Copy fixture (including hidden .vibegraph/ subsystem yamls)
    await cp(fixtureSrc, workDir, { recursive: true })
    // Run initial scan to produce graph.json with drift findings
    await execFileAsync('node', [binPath, 'scan', '--root', workDir], {
      cwd: workDir,
      env: { ...process.env, NODE_ENV: 'production' },
    })
  })

  afterAll(async () => {
    if (cockpit !== null && !cockpit.killed) {
      cockpit.kill('SIGTERM')
      cockpit = null
    }
    if (workDir !== undefined) {
      await rm(workDir, { recursive: true, force: true })
    }
  })

  it('POST /api/findings/<id>/status accepted; re-scan preserves accepted status', async () => {
    // ── 1. Verify initial scan produced a stale drift finding with status open ──
    const graphPath = join(workDir, '.vibegraph', 'cache', 'graph.json')
    const snapshot1 = JSON.parse(await readFile(graphPath, 'utf-8')) as {
      findings: Array<{ id: string; domain: string; type: string; status: string }>
    }
    const staleFinding = snapshot1.findings.find((f) => f.domain === 'drift' && f.type === 'stale')
    expect(staleFinding).toBeDefined()
    expect(staleFinding?.status).toBe('open')
    const findingId = staleFinding?.id // e.g. drift:stale:subsystem:alpha:subsystem:beta

    // ── 2. Spawn cockpit subprocess ────────────────────────────────────────────
    cockpit = spawn(
      'node',
      [binPath, 'default', '--port', String(COCKPIT_PORT), '--no-open', '--root', workDir],
      {
        cwd: workDir,
        stdio: ['ignore', 'pipe', 'pipe'],
        shell: false,
        env: { ...process.env, NODE_ENV: 'production' },
      },
    )

    // Forward stderr for debugging (don't fail on it)
    cockpit.stderr?.on('data', (chunk: Buffer) => {
      process.stderr.write(`[cockpit-child] ${chunk}`)
    })
    cockpit.stdout?.on('data', (chunk: Buffer) => {
      process.stdout.write(`[cockpit-child] ${chunk}`)
    })

    // ── 3. Wait for server readiness ──────────────────────────────────────────
    await waitForReady(COCKPIT_PORT)

    // ── 4. POST accept ────────────────────────────────────────────────────────
    // Colons are valid in URL path segments — do NOT use encodeURIComponent here
    // because the server matches on raw pathname (url.pathname preserves colons).
    const statusUrl = `http://127.0.0.1:${COCKPIT_PORT}/api/findings/${findingId}/status`
    const res = await fetch(statusUrl, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ status: 'accepted' }),
    })
    expect(res.ok).toBe(true)
    const resBody = (await res.json()) as { ok: boolean }
    expect(resBody.ok).toBe(true)

    // ── 5. Verify baseline file was written ────────────────────────────────────
    const baselinePath = join(workDir, '.vibegraph', 'drift-baseline.json')
    const baseline = JSON.parse(await readFile(baselinePath, 'utf-8')) as {
      schemaVersion: string
      items: Record<string, { status: string }>
    }
    expect(baseline.schemaVersion).toBe('1.0')
    expect(baseline.items[findingId]?.status).toBe('accepted')

    // ── 6. Kill cockpit ───────────────────────────────────────────────────────
    cockpit.kill('SIGTERM')
    // Brief wait for the process to exit before re-scan writes to the same path
    await new Promise<void>((r) => setTimeout(r, 300))
    cockpit = null

    // ── 7. Re-scan ────────────────────────────────────────────────────────────
    await execFileAsync('node', [binPath, 'scan', '--root', workDir], {
      cwd: workDir,
      env: { ...process.env, NODE_ENV: 'production' },
    })

    // ── 8. Verify finding carries accepted status in new snapshot ─────────────
    const snapshot2 = JSON.parse(await readFile(graphPath, 'utf-8')) as {
      findings: Array<{ id: string; status: string }>
    }
    const finding2 = snapshot2.findings.find((f) => f.id === findingId)
    expect(finding2).toBeDefined()
    expect(finding2?.status).toBe('accepted')
  }, 60_000)
})
