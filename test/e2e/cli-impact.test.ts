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

describe('vibe-graph impact (E2E)', () => {
  let workDir: string

  beforeAll(() => {
    workDir = realpathSync(mkdtempSync(join(tmpdir(), 'vg-e2e-impact-')))
    cpSync(fixtureSrc, workDir, { recursive: true })
  })

  afterAll(async () => {
    if (workDir !== undefined && existsSync(workDir)) {
      await rm(workDir, { recursive: true, force: true })
    }
  })

  it('--json produces a valid blast radius for subsystem:auth', () => {
    const r = spawnSync(
      'node',
      [binPath, 'impact', 'subsystem:auth', '--root', workDir, '--json'],
      {
        cwd: workDir,
        stdio: 'pipe',
        shell: false,
        encoding: 'utf-8',
        env: { ...process.env, NODE_ENV: 'production' },
      },
    )
    expect(r.status).toBe(0)
    const firstBrace = r.stdout.indexOf('{')
    expect(firstBrace).toBeGreaterThanOrEqual(0)
    const jsonText = r.stdout.slice(firstBrace)
    const parsed = JSON.parse(jsonText) as {
      target: { nodeId: string; kind: string }
      direct: string[]
      transitive: string[]
      cycles: string[]
      totalAffected: number
    }
    expect(parsed.target.nodeId).toBe('subsystem:auth')
    expect(parsed.target.kind).toBe('subsystem')
    // simple-cycle fixture has auth↔billing — billing should appear in cycles
    expect(parsed.cycles).toContain('subsystem:billing')
  }, 60_000)

  it('human output includes target and totalAffected', () => {
    const r = spawnSync('node', [binPath, 'impact', 'subsystem:auth', '--root', workDir], {
      cwd: workDir,
      stdio: 'pipe',
      shell: false,
      encoding: 'utf-8',
      env: { ...process.env, NODE_ENV: 'production' },
    })
    expect(r.status).toBe(0)
    expect(r.stdout).toContain('subsystem:auth')
    expect(r.stdout).toContain('Total affected')
  }, 60_000)

  it('exits 1 on unknown target', () => {
    const r = spawnSync(
      'node',
      [binPath, 'impact', 'subsystem:nonexistent', '--root', workDir, '--json'],
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

  it('--max-depth=1 limits transitive', () => {
    const r = spawnSync(
      'node',
      [binPath, 'impact', 'subsystem:auth', '--root', workDir, '--json', '--max-depth', '1'],
      {
        cwd: workDir,
        stdio: 'pipe',
        shell: false,
        encoding: 'utf-8',
        env: { ...process.env, NODE_ENV: 'production' },
      },
    )
    expect(r.status).toBe(0)
    const firstBrace = r.stdout.indexOf('{')
    const parsed = JSON.parse(r.stdout.slice(firstBrace)) as {
      target: { nodeId: string }
      transitive: string[]
    }
    expect(parsed.target.nodeId).toBe('subsystem:auth')
    // depth 1 should not have any transitive entries (only direct)
    expect(parsed.transitive).toEqual([])
  }, 60_000)
})
