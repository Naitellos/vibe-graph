import { spawnSync } from 'node:child_process'
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

/**
 * Parse the first complete JSON object out of stdout.
 * The CLI may emit extra log lines after the JSON pack (citty root handler
 * runs after subcommand handlers). We extract only the first complete object.
 */
function parseFirstJsonObject(stdout: string): unknown {
  const firstBrace = stdout.indexOf('{')
  if (firstBrace < 0) throw new Error('No JSON object found in stdout')
  let depth = 0
  let end = -1
  for (let i = firstBrace; i < stdout.length; i++) {
    if (stdout[i] === '{') depth++
    else if (stdout[i] === '}') {
      depth--
      if (depth === 0) {
        end = i
        break
      }
    }
  }
  if (end < 0) throw new Error('Unterminated JSON object in stdout')
  return JSON.parse(stdout.slice(firstBrace, end + 1))
}

describe('vibe-graph context (E2E)', () => {
  let workDir: string

  beforeAll(() => {
    workDir = realpathSync(mkdtempSync(join(tmpdir(), 'vg-e2e-context-')))
    cpSync(fixtureSrc, workDir, { recursive: true })
  })

  afterAll(async () => {
    if (workDir !== undefined && existsSync(workDir)) {
      await rm(workDir, { recursive: true, force: true })
    }
  })

  it('--json produces a valid ContextPack for subsystem:auth', () => {
    const r = spawnSync(
      'node',
      [binPath, 'context', 'subsystem:auth', '--root', workDir, '--json'],
      {
        cwd: workDir,
        stdio: 'pipe',
        shell: false,
        encoding: 'utf-8',
        env: { ...process.env, NODE_ENV: 'production' },
      },
    )
    expect(r.status).toBe(0)

    // The raw JSON pack goes to stdout. Extract only the first complete JSON
    // object — citty may also run the root handler which emits trailing lines.
    const pack = parseFirstJsonObject(r.stdout) as {
      target: string
      id: string
      criticalFiles: Array<{ path: string; role: string }>
      tokenBudget: number
      estimatedTokens: number
    }

    expect(pack.target).toBe('subsystem:auth')
    expect(pack.id).toMatch(/^ctx_[0-9a-f]{16}$/)
    expect(pack.criticalFiles.length).toBeGreaterThan(0)
    expect(pack.tokenBudget).toBe(8000)
    expect(pack.estimatedTokens).toBeGreaterThan(0)
  }, 60_000)

  it('human-readable output contains target name', () => {
    const r = spawnSync('node', [binPath, 'context', 'subsystem:auth', '--root', workDir], {
      cwd: workDir,
      stdio: 'pipe',
      shell: false,
      encoding: 'utf-8',
      env: { ...process.env, NODE_ENV: 'production' },
    })
    expect(r.status).toBe(0)
    // Human mode writes to stdout via pino-pretty
    const combined = r.stdout + r.stderr
    expect(combined).toMatch(/auth/i)
  }, 60_000)

  it('--max-tokens / --max-files are respected', () => {
    const r = spawnSync(
      'node',
      [
        binPath,
        'context',
        'subsystem:auth',
        '--root',
        workDir,
        '--json',
        '--max-tokens',
        '500',
        '--max-files',
        '2',
      ],
      {
        cwd: workDir,
        stdio: 'pipe',
        shell: false,
        encoding: 'utf-8',
        env: { ...process.env, NODE_ENV: 'production' },
      },
    )
    expect(r.status).toBe(0)
    const pack = parseFirstJsonObject(r.stdout) as {
      tokenBudget: number
      criticalFiles: unknown[]
    }
    expect(pack.tokenBudget).toBe(500)
    expect(pack.criticalFiles.length).toBeLessThanOrEqual(2)
  }, 60_000)

  it('exits 1 with helpful message on unknown target', () => {
    const r = spawnSync(
      'node',
      [binPath, 'context', 'subsystem:nonexistent', '--root', workDir, '--json'],
      {
        cwd: workDir,
        stdio: 'pipe',
        shell: false,
        encoding: 'utf-8',
        env: { ...process.env, NODE_ENV: 'production' },
      },
    )
    expect(r.status).toBe(1)
    // Error message should appear somewhere in stderr (pino JSON logger)
    expect(r.stderr).toContain('nonexistent')
  }, 60_000)

  it('exits 1 for invalid --max-tokens value', () => {
    const r = spawnSync(
      'node',
      [
        binPath,
        'context',
        'subsystem:auth',
        '--root',
        workDir,
        '--json',
        '--max-tokens',
        'notanumber',
      ],
      {
        cwd: workDir,
        stdio: 'pipe',
        shell: false,
        encoding: 'utf-8',
        env: { ...process.env, NODE_ENV: 'production' },
      },
    )
    expect(r.status).toBe(1)
  }, 60_000)
})
