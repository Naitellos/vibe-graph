import { spawnSync } from 'node:child_process'
import { existsSync, mkdtempSync, readFileSync, realpathSync, writeFileSync } from 'node:fs'
import { rm } from 'node:fs/promises'
import { tmpdir } from 'node:os'
import { dirname, join, resolve } from 'node:path'
import { fileURLToPath } from 'node:url'
import { afterAll, beforeAll, describe, expect, it } from 'vitest'

// Note: build is handled in test/e2e/global-setup.ts

const __dirname = dirname(fileURLToPath(import.meta.url))
const repoRoot = resolve(__dirname, '../..')
const binPath = join(repoRoot, 'packages/cli/dist/bin.js')
const nodeBin = process.execPath

const { TEST: _TEST, VITEST: _VITEST, ...inheritedEnv } = process.env
const spawnEnv = { ...inheritedEnv, NODE_ENV: 'production', CONSOLA_LEVEL: '3' }

describe('vibe-graph init --yes (E2E)', () => {
  let workDir: string

  beforeAll(() => {
    workDir = realpathSync(mkdtempSync(join(tmpdir(), 'vg-e2e-init-')))
    writeFileSync(join(workDir, 'package.json'), JSON.stringify({ name: 'my-init-test' }))
  })

  afterAll(async () => {
    if (workDir && existsSync(workDir)) {
      await rm(workDir, { recursive: true, force: true })
    }
  })

  it('exits 0 and generates all expected files', () => {
    const r = spawnSync(nodeBin, [binPath, 'init', '--yes', '--json'], {
      cwd: workDir,
      stdio: 'pipe',
      shell: false,
      encoding: 'utf-8',
      env: spawnEnv,
    })
    expect(r.status).toBe(0)
    expect(existsSync(join(workDir, '.vibegraph/config.yml'))).toBe(true)
    expect(existsSync(join(workDir, '.vibegraphignore'))).toBe(true)
    expect(existsSync(join(workDir, '.gitignore'))).toBe(true)
    const cfg = readFileSync(join(workDir, '.vibegraph/config.yml'), 'utf-8')
    expect(cfg).toContain('name: my-init-test')
  }, 60_000)
})
