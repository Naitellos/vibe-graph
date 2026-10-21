// test/e2e/cli-validate-diff-route.test.ts
//
// E2E: POST /api/validate-diff — tests the HTTP route.
//
// Two scenarios:
//   1. Happy path: scan + baseline run first, then POST returns 200 with
//      sanitized ValidateDiffUiPayload (no raw graphDelta key, no files/metadata
//      on node items).
//   2. No-baseline: POST against a root that has a snapshot but no baseline
//      → 409 + body.code === 'NO_BASELINE'.
//
// Build is handled by test/e2e/global-setup.ts.

import { spawnSync } from 'node:child_process'
import { cp, mkdtemp, rm } from 'node:fs/promises'
import { tmpdir } from 'node:os'
import { dirname, join, resolve } from 'node:path'
import { fileURLToPath } from 'node:url'
import { afterAll, beforeAll, describe, expect, it } from 'vitest'
import { type ServerHandle, startCliServerInFixture, stopCliServer } from './helpers/cli-server.js'

const __dirname = dirname(fileURLToPath(import.meta.url))
const repoRoot = resolve(__dirname, '../..')
const binPath = join(repoRoot, 'packages/cli/dist/bin.js')

// ─── Happy path: server started after scan + baseline ────────────────────────

let server: ServerHandle | undefined

beforeAll(async () => {
  // Start the server on a fixture that has a valid scan + baseline.
  // startCliServerInFixture copies the fixture to a fresh tmpdir and spawns
  // `vibe-graph default --port --no-open --root <tmpdir>`. The server auto-scans
  // on startup. We then run `baseline` via spawnSync while the server is running
  // (baseline only writes a JSON file — it doesn't conflict with the server).
  server = await startCliServerInFixture('fixtures/synthetic/rich-yaml', 3221)

  // Create the baseline so validate-diff can compare against it.
  const baselineResult = spawnSync('node', [binPath, 'baseline', '--root', server.projectRoot], {
    cwd: server.projectRoot,
    stdio: 'pipe',
    shell: false,
    encoding: 'utf-8',
    timeout: 30_000,
  })
  if (baselineResult.status !== 0) {
    throw new Error(
      `baseline command failed (status ${baselineResult.status}): ${baselineResult.stderr}`,
    )
  }
}, 60_000)

afterAll(async () => {
  if (server) await stopCliServer(server)
})

describe('POST /api/validate-diff — happy path (with baseline)', () => {
  it('returns HTTP 200, ok:true, and a sanitized ValidateDiffUiPayload', async () => {
    // Pass workingFiles:[] so the route uses the explicit empty list rather than
    // falling back to `git diff` (the tmpdir fixture is not a git repo).
    const res = await fetch(`${server?.baseUrl}/api/validate-diff`, {
      method: 'POST',
      headers: { 'content-type': 'application/json' },
      body: JSON.stringify({ workingFiles: [] }),
    })
    expect(res.status).toBe(200)
    const body = (await res.json()) as Record<string, unknown>
    expect(body.ok).toBe(true)

    const data = body.data as Record<string, unknown>
    expect(data).toBeDefined()

    // status must be one of the three valid values
    expect(['ok', 'warn', 'violation']).toContain(data.status)

    // counts is an object with the 6 numeric fields
    const counts = data.counts as Record<string, unknown>
    expect(typeof counts.addedEdges).toBe('number')
    expect(typeof counts.removedEdges).toBe('number')
    expect(typeof counts.newViolations).toBe('number')
    expect(typeof counts.removedViolations).toBe('number')
    expect(typeof counts.newFindings).toBe('number')
    expect(typeof counts.resolvedFindings).toBe('number')

    // sanitization: no raw graphDelta key on data
    expect(Object.keys(data)).not.toContain('graphDelta')

    // sanitized shape is present (non-vacuous even when arrays are empty)
    expect(data.edges).toBeDefined()
    expect(data.violations).toBeDefined()
    expect(Array.isArray(data.blastRadius)).toBe(true)
    const nodes = data.nodes as { added: Record<string, unknown>[]; removed: unknown }
    expect(Array.isArray(nodes.added)).toBe(true)

    // sanitization: node.added items must NOT have 'files' or 'metadata' keys
    for (const n of nodes.added) {
      expect(Object.keys(n)).not.toContain('files')
      expect(Object.keys(n)).not.toContain('metadata')
    }
  })
})

// ─── No-baseline: 409 with NO_BASELINE ───────────────────────────────────────

describe('POST /api/validate-diff — no baseline', () => {
  let noBaselineServer: ServerHandle
  let noBaselineTmpDir: string

  beforeAll(async () => {
    // Start a server on a fresh copy of the fixture — but deliberately do NOT
    // run `baseline`, so validate-diff will throw NO_BASELINE.
    noBaselineTmpDir = await mkdtemp(join(tmpdir(), 'vg-e2e-vd-route-nbl-'))
    const fixtureSrc = join(repoRoot, 'fixtures/synthetic/rich-yaml')
    await cp(fixtureSrc, noBaselineTmpDir, { recursive: true })

    // Spawn the server. It will auto-scan on startup (no graph.json present).
    const { spawn } = await import('node:child_process')
    const proc = spawn(
      'node',
      [binPath, 'default', '--port', '3222', '--no-open', '--root', noBaselineTmpDir],
      {
        cwd: noBaselineTmpDir,
        stdio: ['ignore', 'pipe', 'pipe'],
        shell: false,
        env: { ...process.env, NODE_ENV: 'production' },
      },
    )
    proc.stderr?.on('data', (chunk: Buffer) => {
      process.stderr.write(`[nbl-cockpit] ${chunk}`)
    })
    proc.stdout?.on('data', (chunk: Buffer) => {
      process.stdout.write(`[nbl-cockpit] ${chunk}`)
    })

    // Wait for the server to be ready
    const deadline = Date.now() + 20_000
    while (Date.now() < deadline) {
      try {
        const r = await fetch('http://127.0.0.1:3222/api/health')
        if (r.ok) break
      } catch {
        // not ready yet
      }
      await new Promise<void>((resolve) => setTimeout(resolve, 200))
    }

    noBaselineServer = { baseUrl: 'http://127.0.0.1:3222', projectRoot: noBaselineTmpDir, proc }
  }, 40_000)

  afterAll(async () => {
    if (noBaselineServer?.proc && !noBaselineServer.proc.killed) {
      noBaselineServer.proc.kill('SIGTERM')
    }
    await rm(noBaselineTmpDir, { recursive: true, force: true })
  })

  it('returns 409 with code NO_BASELINE when no baseline exists', async () => {
    const res = await fetch(`${noBaselineServer.baseUrl}/api/validate-diff`, {
      method: 'POST',
      headers: { 'content-type': 'application/json' },
      body: JSON.stringify({ workingFiles: [] }),
    })
    expect(res.status).toBe(409)
    const body = (await res.json()) as Record<string, unknown>
    expect(body.ok).toBe(false)
    expect(body.code).toBe('NO_BASELINE')
  })
})
