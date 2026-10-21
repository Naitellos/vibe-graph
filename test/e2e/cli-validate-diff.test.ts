// test/e2e/cli-validate-diff.test.ts
//
// E2E tests for `vibe-graph validate-diff`.
//
// Scenarios:
// 1. No baseline -> exits 1, output mentions "NO_BASELINE"
// 2. Baseline + no changes (--working-files=,) -> exits 0, stdout "Status: OK"
// 3. Baseline + enforce violation (full pipeline via fixture) -> exits 1, stdout "VIOLATIONS",
//    mentions "builtin:no-layer-violation", verdict "VIOLATION"
// 4. --json mode -> valid JSON { verdict, exitCode, newViolations, newFindings }

import { spawnSync } from 'node:child_process'
import { randomUUID } from 'node:crypto'
import { cpSync } from 'node:fs'
import { mkdir, rm, writeFile } from 'node:fs/promises'
import { tmpdir } from 'node:os'
import { dirname, join, resolve } from 'node:path'
import { fileURLToPath } from 'node:url'
import { afterEach, beforeEach, describe, expect, it } from 'vitest'

// Note: build is handled in test/e2e/global-setup.ts

const __dirname = dirname(fileURLToPath(import.meta.url))
const repoRoot = resolve(__dirname, '../..')
const CLI = join(repoRoot, 'packages', 'cli', 'dist', 'bin.js')
const FIXTURE_SRC = join(repoRoot, 'fixtures', 'synthetic', 'rules-cases', 'edge-pattern-violation')

describe('e2e: vibe-graph validate-diff', () => {
  let tmpRoot: string

  beforeEach(async () => {
    tmpRoot = join(tmpdir(), `vg-e2e-vd-${Date.now()}-${Math.floor(Math.random() * 1e9)}`)
    await mkdir(tmpRoot, { recursive: true })
  })

  afterEach(async () => {
    await rm(tmpRoot, { recursive: true, force: true })
  })

  /** Write a minimal GraphBaseline to .vibegraph/cache/baseline.json. */
  async function seedBaseline(): Promise<void> {
    await mkdir(join(tmpRoot, '.vibegraph', 'cache'), { recursive: true })
    await writeFile(
      join(tmpRoot, '.vibegraph', 'cache', 'baseline.json'),
      `${JSON.stringify({
        schemaVersion: '1.0',
        snapshotId: randomUUID(),
        createdAt: '2026-05-28T00:00:00.000Z',
        fingerprint: 'sha256:test',
        nodes: [],
        edges: [],
        findings: [],
      })}\n`,
      'utf-8',
    )
  }

  it('exits 1 with NO_BASELINE when no baseline exists', async () => {
    await mkdir(join(tmpRoot, '.vibegraph', 'cache'), { recursive: true })
    // Pass ',' so workingFiles resolves to [] (no git fallback attempted)
    const result = spawnSync(
      'node',
      [CLI, 'validate-diff', '--root', tmpRoot, '--working-files', ','],
      {
        encoding: 'utf-8',
      },
    )
    expect(result.status).toBe(1)
    expect(result.stdout + result.stderr).toContain('NO_BASELINE')
  })

  it('exits 0 with verdict OK when baseline exists and no changes', async () => {
    await seedBaseline()
    // ',' splits to [] after trim+filter — forces workingFiles path, no git diff
    const result = spawnSync(
      'node',
      [CLI, 'validate-diff', '--root', tmpRoot, '--working-files', ','],
      {
        encoding: 'utf-8',
      },
    )
    expect(result.status).toBe(0)
    expect(result.stdout).toContain('OK')
  })

  it('exits 1 with verdict VIOLATION on enforce rule (full pipeline via fixture)', async () => {
    // Copy the Plan 2 rules-cases/edge-pattern-violation fixture into tmpRoot.
    // cpSync(src, dst, { recursive: true }) copies contents directly into dst.
    cpSync(FIXTURE_SRC, tmpRoot, { recursive: true })

    // scan + baseline with no violation present
    const scan1 = spawnSync('node', [CLI, 'scan', '--root', tmpRoot], {
      cwd: tmpRoot,
      encoding: 'utf-8',
    })
    expect(scan1.status).toBe(0)

    const baseline = spawnSync('node', [CLI, 'baseline', '--root', tmpRoot], {
      cwd: tmpRoot,
      encoding: 'utf-8',
    })
    expect(baseline.status).toBe(0)

    // Introduce the violating import: domain -> horizontal (ui)
    await writeFile(
      join(tmpRoot, 'src', 'domain', 'foo.ts'),
      "import { bar } from '../ui/bar.js'\nexport const foo = bar + ' from domain'\n",
      'utf-8',
    )

    // Re-scan so the working graph contains the new forbidden edge
    const scan2 = spawnSync('node', [CLI, 'scan', '--root', tmpRoot], {
      cwd: tmpRoot,
      encoding: 'utf-8',
    })
    expect(scan2.status).toBe(0)

    // validate-diff with the changed file listed explicitly (skips git)
    const result = spawnSync(
      'node',
      [CLI, 'validate-diff', '--root', tmpRoot, '--working-files', 'src/domain/foo.ts'],
      { cwd: tmpRoot, encoding: 'utf-8' },
    )
    expect(result.status).toBe(1)
    expect(result.stdout).toContain('VIOLATIONS')
    expect(result.stdout).toContain('builtin:no-layer-violation')
    expect(result.stdout).toContain('VIOLATION')
  }, 60_000) // allow time for two scan invocations

  it('emits valid JSON with --json (zero-changes case)', async () => {
    await seedBaseline()
    const result = spawnSync(
      'node',
      [CLI, 'validate-diff', '--root', tmpRoot, '--working-files', ',', '--json'],
      { encoding: 'utf-8' },
    )
    expect(result.status).toBe(0)
    // Take the last non-empty line to skip any pino log lines
    const lines = result.stdout
      .trim()
      .split('\n')
      .filter((s) => s.length > 0)
    const lastLine = lines.pop()
    if (lastLine === undefined) throw new Error('No output from --json')
    const parsed = JSON.parse(lastLine) as Record<string, unknown>
    expect(parsed).toMatchObject({
      status: 'ok',
      verdict: 'ok',
      exitCode: 0,
      newViolations: [],
      newFindings: [],
    })
  })
})
