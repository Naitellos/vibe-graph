import { mkdirSync, mkdtempSync, realpathSync, writeFileSync } from 'node:fs'
import { tmpdir } from 'node:os'
import { dirname, join } from 'node:path'
import { buildLoadedSnapshot, scan } from '@codearch/core'
import { describe, expect, it } from 'vitest'
import { parsePositiveInt, runImpact } from './impact.js'

function mkTmp(): string {
  return realpathSync(mkdtempSync(join(tmpdir(), 'vg-cli-impact-')))
}

function touch(root: string, relPath: string, body = ''): void {
  const abs = join(root, relPath)
  mkdirSync(dirname(abs), { recursive: true })
  writeFileSync(abs, body)
}

describe('parsePositiveInt', () => {
  it('returns fallback for undefined', () => {
    expect(parsePositiveInt(undefined, 5)).toBe(5)
  })
  it('returns fallback for empty string', () => {
    expect(parsePositiveInt('', 5)).toBe(5)
  })
  it('parses valid string', () => {
    expect(parsePositiveInt('10', 5)).toBe(10)
  })
  it('rejects non-string', () => {
    expect(parsePositiveInt(10, 5)).toBe(null)
  })
  it('rejects zero', () => {
    expect(parsePositiveInt('0', 5)).toBe(null)
  })
  it('rejects negative', () => {
    expect(parsePositiveInt('-3', 5)).toBe(null)
  })
  it('rejects non-integer', () => {
    expect(parsePositiveInt('3.5', 5)).toBe(null)
  })
  it('rejects garbage', () => {
    expect(parsePositiveInt('abc', 5)).toBe(null)
  })
})

describe('runImpact', () => {
  it('returns blast radius for a real fixture subsystem', async () => {
    const root = mkTmp()
    writeFileSync(join(root, 'package.json'), JSON.stringify({ name: 'impact-test' }))
    writeFileSync(
      join(root, 'tsconfig.json'),
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
    touch(root, 'src/a/index.ts', 'export const a = 1\n')
    touch(root, 'src/b/index.ts', "import { a } from '../a/index.js'\nexport const b = a + 1\n")
    touch(root, 'src/c/index.ts', "import { b } from '../b/index.js'\nexport const c = b\n")

    const snap = await scan({ root })
    const loaded = buildLoadedSnapshot(snap)

    // Radius of subsystem:a → b, c consume it (directly or transitively)
    const result = runImpact(loaded, { target: 'subsystem:a', maxDepth: 5 })
    expect('error' in result).toBe(false)
    if (!('error' in result)) {
      expect(result.target.nodeId).toBe('subsystem:a')
      expect(result.target.kind).toBe('subsystem')
      // At least one node should be in direct or transitive
      expect(result.totalAffected).toBeGreaterThanOrEqual(1)
    }
  }, 30_000)

  it('returns TARGET_NOT_FOUND for unknown target', async () => {
    const root = mkTmp()
    writeFileSync(join(root, 'package.json'), JSON.stringify({ name: 'x' }))
    touch(root, 'src/a.ts', 'export const a = 1\n')

    const snap = await scan({ root })
    const loaded = buildLoadedSnapshot(snap)

    const result = runImpact(loaded, { target: 'subsystem:nonexistent', maxDepth: 5 })
    expect('error' in result).toBe(true)
    if ('error' in result) {
      expect(result.error).toBe('TARGET_NOT_FOUND')
    }
  }, 30_000)

  it('supports kind:slug shorthand', async () => {
    const root = mkTmp()
    writeFileSync(join(root, 'package.json'), JSON.stringify({ name: 'x' }))
    writeFileSync(
      join(root, 'tsconfig.json'),
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
    touch(root, 'src/auth/index.ts', 'export const auth = 1\n')

    const snap = await scan({ root })
    const loaded = buildLoadedSnapshot(snap)

    // 'auth' should resolve to subsystem:auth
    const result = runImpact(loaded, { target: 'auth', maxDepth: 5 })
    expect('error' in result).toBe(false)
    if (!('error' in result)) {
      expect(result.target.nodeId).toBe('subsystem:auth')
    }
  }, 30_000)
})
