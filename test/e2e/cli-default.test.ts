import { spawn } from 'node:child_process'
import { cpSync, existsSync, mkdtempSync, realpathSync } from 'node:fs'
import { rm } from 'node:fs/promises'
import { tmpdir } from 'node:os'
import { dirname, join, resolve } from 'node:path'
import { fileURLToPath } from 'node:url'
import { afterAll, beforeAll, describe, expect, it } from 'vitest'

// Note: build is handled in test/e2e/global-setup.ts

const __dirname = dirname(fileURLToPath(import.meta.url))
const repoRoot = resolve(__dirname, '../..')
const binPath = join(repoRoot, 'packages/cli/dist/bin.js')
const fixtureSrc = join(repoRoot, 'fixtures/synthetic/simple-cycle')

describe('vibe-graph default (E2E)', () => {
  let workDir: string

  beforeAll(() => {
    workDir = realpathSync(mkdtempSync(join(tmpdir(), 'vg-e2e-default-')))
    cpSync(fixtureSrc, workDir, { recursive: true })
  })

  afterAll(async () => {
    if (workDir !== undefined && existsSync(workDir)) {
      await rm(workDir, { recursive: true, force: true })
    }
  })

  it('--no-open binds, responds to /api/health, exits cleanly on SIGTERM', async () => {
    // Use port 0 not directly supported by --port (CLI parses as int), so let auto-fallback pick a free high port
    const child = spawn(
      'node',
      [binPath, 'default', '--root', workDir, '--no-open', '--port', '55099'],
      {
        cwd: workDir,
        stdio: 'pipe',
        shell: false,
        env: { ...process.env, NODE_ENV: 'production' },
      },
    )

    let bound = false
    const onStderr = (chunk: Buffer): void => {
      const text = chunk.toString('utf-8')
      // pino-pretty logs to stdout/stderr — look for the listening message
      if (text.includes('cockpit: listening')) bound = true
    }
    child.stderr.on('data', onStderr)
    child.stdout.on('data', onStderr)

    // Wait up to 30s for the server to bind
    const deadline = Date.now() + 30_000
    while (!bound && Date.now() < deadline) {
      await new Promise<void>((r) => setTimeout(r, 200))
    }

    try {
      expect(bound).toBe(true)

      // Hit /api/health
      const resp = await fetch('http://localhost:55099/api/health')
      expect(resp.status).toBe(200)
      const body = (await resp.json()) as { ok: boolean }
      expect(body.ok).toBe(true)

      // GET / returns HTML with Vibe Graph title
      const uiResp = await fetch('http://localhost:55099/')
      expect(uiResp.status).toBe(200)
      expect(uiResp.headers.get('content-type')).toContain('text/html')
      const html = await uiResp.text()
      expect(html).toContain('Vibe Graph')
    } finally {
      // Clean shutdown
      child.kill('SIGTERM')
      await new Promise<void>((r) => {
        child.once('exit', () => r())
        setTimeout(r, 5000)
      })
    }
  }, 90_000)
})
