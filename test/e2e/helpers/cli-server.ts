// test/e2e/helpers/cli-server.ts
//
// Shared helper for E2E tests that need to boot the cockpit HTTP server
// against a fixture directory.

import { type ChildProcess, spawn } from 'node:child_process'
import { cp, mkdtemp, rm } from 'node:fs/promises'
import { tmpdir } from 'node:os'
import { dirname, join, resolve } from 'node:path'
import { fileURLToPath } from 'node:url'

const __dirname = dirname(fileURLToPath(import.meta.url))
const repoRoot = resolve(__dirname, '../../..')
const binPath = join(repoRoot, 'packages/cli/dist/bin.js')

export interface ServerHandle {
  baseUrl: string
  projectRoot: string
  proc: ChildProcess
}

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

/**
 * Copy `fixtureRelPath` (relative to repo root) into a fresh tmpdir, spawn
 * `vibe-graph default --port <port> --no-open --root <tmpdir>`, wait for
 * /api/health to respond 200, then return the handle.
 *
 * Call `stopCliServer(handle)` in `afterAll` to kill the process and clean up.
 */
export async function startCliServerInFixture(
  fixtureRelPath: string,
  port = 3218,
): Promise<ServerHandle> {
  const fixtureSrc = join(repoRoot, fixtureRelPath)
  const workDir = await mkdtemp(join(tmpdir(), 'vg-e2e-cockpit-'))

  // Copy fixture (including hidden .vibegraph/ subsystem yamls)
  await cp(fixtureSrc, workDir, { recursive: true })

  const proc = spawn(
    'node',
    [binPath, 'default', '--port', String(port), '--no-open', '--root', workDir],
    {
      cwd: workDir,
      stdio: ['ignore', 'pipe', 'pipe'],
      shell: false,
      env: { ...process.env, NODE_ENV: 'production' },
    },
  )

  // Forward output for debugging
  proc.stderr?.on('data', (chunk: Buffer) => {
    process.stderr.write(`[cockpit-child] ${chunk}`)
  })
  proc.stdout?.on('data', (chunk: Buffer) => {
    process.stdout.write(`[cockpit-child] ${chunk}`)
  })

  await waitForReady(port)

  return {
    baseUrl: `http://127.0.0.1:${port}`,
    projectRoot: workDir,
    proc,
  }
}

/**
 * SIGTERM the cockpit process and remove the tmpdir.
 */
export async function stopCliServer(handle: ServerHandle): Promise<void> {
  if (!handle.proc.killed) {
    handle.proc.kill('SIGTERM')
  }
  await rm(handle.projectRoot, { recursive: true, force: true })
}
