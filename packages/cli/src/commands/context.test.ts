/**
 * Unit tests for context command helpers.
 *
 * Design choice: we test the extracted `runContext` + `parsePositiveInt` helpers
 * directly. The citty handler wiring and human-render output are covered by the
 * E2E test at test/e2e/cli-context.test.ts. This avoids setting up a full CLI
 * invocation in unit tests while still exercising the core logic.
 */
import { mkdirSync, mkdtempSync, realpathSync, writeFileSync } from 'node:fs'
import { tmpdir } from 'node:os'
import { dirname, join } from 'node:path'
import { buildLoadedSnapshot, scan } from '@codearch/core'
import { afterAll, beforeAll, describe, expect, it } from 'vitest'
import { parsePositiveInt, runContext } from './context.js'

// ── Fixture helpers ────────────────────────────────────────────────────────────

function mkTmp(): string {
  return realpathSync(mkdtempSync(join(tmpdir(), 'vg-ctx-unit-')))
}

function touch(root: string, relPath: string, body = ''): void {
  const abs = join(root, relPath)
  mkdirSync(dirname(abs), { recursive: true })
  writeFileSync(abs, body)
}

// ── parsePositiveInt ───────────────────────────────────────────────────────────

describe('parsePositiveInt', () => {
  it('returns fallback for undefined', () => {
    expect(parsePositiveInt(undefined, 8000)).toBe(8000)
  })

  it('returns fallback for empty string', () => {
    expect(parsePositiveInt('', 8000)).toBe(8000)
  })

  it('parses a valid positive integer string', () => {
    expect(parsePositiveInt('4000', 8000)).toBe(4000)
  })

  it('returns null for zero', () => {
    expect(parsePositiveInt('0', 8000)).toBeNull()
  })

  it('returns null for negative integer string', () => {
    expect(parsePositiveInt('-1', 8000)).toBeNull()
  })

  it('returns null for a float string', () => {
    expect(parsePositiveInt('3.5', 8000)).toBeNull()
  })

  it('returns null for a non-numeric string', () => {
    expect(parsePositiveInt('abc', 8000)).toBeNull()
  })

  it('returns null for a non-string non-undefined value', () => {
    expect(parsePositiveInt(42, 8000)).toBeNull()
  })
})

// ── runContext ─────────────────────────────────────────────────────────────────

describe('runContext', () => {
  let projectRoot: string

  beforeAll(async () => {
    projectRoot = mkTmp()

    // Minimal project with two source files and a package.json so scan picks
    // them up as a subsystem.
    writeFileSync(join(projectRoot, 'package.json'), JSON.stringify({ name: 'ctx-unit-fixture' }))
    writeFileSync(
      join(projectRoot, 'tsconfig.json'),
      JSON.stringify({
        compilerOptions: {
          strict: true,
          target: 'ES2022',
          module: 'NodeNext',
          moduleResolution: 'NodeNext',
        },
        include: ['src/**/*'],
      }),
    )
    touch(projectRoot, 'src/auth/index.ts', 'export const login = () => {}\n')
    touch(
      projectRoot,
      'src/billing/index.ts',
      "import { login } from '../auth/index.js'\nexport const pay = () => login()\n",
    )
  }, 30_000)

  it('builds a context pack for a file node', async () => {
    const snap = await scan({ root: projectRoot })
    const loaded = buildLoadedSnapshot(snap)

    const pack = await runContext(loaded, {
      target: 'file:src/auth/index.ts',
      maxTokens: 8000,
      maxFiles: 10,
      projectRoot,
    })

    expect(pack.target).toBe('file:src/auth/index.ts')
    expect(pack.id).toMatch(/^ctx_[0-9a-f]{16}$/)
    expect(pack.tokenBudget).toBe(8000)
    // summary contains the node's title (the filename) and kind
    expect(pack.summary).toMatch(/file/)
    // criticalFiles should include the target file itself
    expect(pack.criticalFiles.length).toBeGreaterThan(0)
    expect(pack.criticalFiles.some((f) => f.path.includes('auth'))).toBe(true)
  }, 30_000)

  it('throws on an unknown target', async () => {
    const snap = await scan({ root: projectRoot })
    const loaded = buildLoadedSnapshot(snap)

    await expect(
      runContext(loaded, {
        target: 'subsystem:does-not-exist',
        maxTokens: 8000,
        maxFiles: 10,
        projectRoot,
      }),
    ).rejects.toThrow(/NOT_FOUND|AMBIGUOUS|not found/)
  }, 30_000)

  it('respects maxTokens budget', async () => {
    const snap = await scan({ root: projectRoot })
    const loaded = buildLoadedSnapshot(snap)

    const pack = await runContext(loaded, {
      target: 'file:src/auth/index.ts',
      maxTokens: 100,
      maxFiles: 5,
      projectRoot,
    })

    expect(pack.tokenBudget).toBe(100)
    expect(pack.estimatedTokens).toBeLessThanOrEqual(200) // slight overshoot is acceptable
  }, 30_000)

  it('passes intent through (no error)', async () => {
    const snap = await scan({ root: projectRoot })
    const loaded = buildLoadedSnapshot(snap)

    await expect(
      runContext(loaded, {
        target: 'file:src/auth/index.ts',
        maxTokens: 8000,
        maxFiles: 10,
        projectRoot,
        intent: 'refactor for testability',
      }),
    ).resolves.toBeDefined()
  }, 30_000)
})
