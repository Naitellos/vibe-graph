import { spawnSync } from 'node:child_process'
import { cpSync, existsSync, mkdtempSync, readFileSync, realpathSync } from 'node:fs'
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

describe('vibe-graph scan (E2E)', () => {
  let workDir: string

  beforeAll(() => {
    // Copy fixture to tmp so we don't pollute the source tree
    workDir = realpathSync(mkdtempSync(join(tmpdir(), 'vg-e2e-scan-')))
    cpSync(fixtureSrc, workDir, { recursive: true })
    // Don't copy .vibegraph from fixture; ensure clean state
  })

  afterAll(async () => {
    if (workDir !== undefined && existsSync(workDir)) {
      await rm(workDir, { recursive: true, force: true })
    }
  })

  it('exits 0 and writes graph.json with expected counts', () => {
    const result = spawnSync('node', [binPath, 'scan', '--json', '--root', workDir], {
      cwd: workDir,
      stdio: 'pipe',
      shell: false,
      encoding: 'utf-8',
      env: { ...process.env, NODE_ENV: 'production' },
    })
    expect(result.status).toBe(0)
    // graph.json exists
    const graphPath = join(workDir, '.vibegraph/cache/graph.json')
    expect(existsSync(graphPath)).toBe(true)
    // contents parse and have expected shape
    const snapshot = JSON.parse(readFileSync(graphPath, 'utf-8')) as {
      meta: { projectName: string; scanId: string }
      nodes: Array<{ id: string }>
      findings: Array<{ type: string }>
    }
    expect(snapshot.meta.projectName).toBe('simple-cycle')
    expect(snapshot.nodes.length).toBeGreaterThan(0)
    expect(snapshot.findings.find((f) => f.type === 'cycle')).toBeDefined()
  }, 60_000)
})
