/**
 * Invariant: .env files are never included in ContextPack output.
 *
 * Defense-in-depth test — verifies TWO independent gates:
 *   1. scan() respects DEFAULT_IGNORE_PATTERNS which includes '.env' and '.env.*',
 *      so no file:\.env node is created in the snapshot.
 *   2. buildContextPack() never includes a .env path in criticalFiles, and
 *      no .env secret content appears in any excerpt.
 *
 * Fixture: test/invariants/fixtures/no-env-pack/ — a small TS project that
 * contains a real .env file with SECRET= values alongside normal .ts files.
 */
import { rm, writeFile } from 'node:fs/promises'
import { dirname, join } from 'node:path'
import { fileURLToPath } from 'node:url'
import { afterAll, beforeAll, describe, expect, it } from 'vitest'
import { createIgnoreMatcher } from '../../packages/core/src/analyzers/ignore-matcher.js'
import { buildContextPack } from '../../packages/core/src/helpers/context-pack-builder.js'
import { scan } from '../../packages/core/src/scan/scan.js'
import { buildLoadedSnapshot } from '../../packages/core/src/snapshot/load-snapshot.js'

const __dirname = dirname(fileURLToPath(import.meta.url))
const FIXTURE_ROOT = join(__dirname, 'fixtures/no-env-pack')

// The ignore matcher with defaults (includes .env and .env.*)
const defaultIgnore = createIgnoreMatcher({ patterns: [], includeDefaults: true })

// .env content — must NOT appear anywhere in ContextPack output
const ENV_FILE_CONTENT = [
  'SECRET=super-secret-value-that-must-never-appear-in-context-pack',
  'DB_PASSWORD=another-secret-12345',
  'API_KEY=sk-test-key-must-not-leak',
].join('\n')

describe('invariant: .env files never appear in ContextPack output', () => {
  let snapshot: Awaited<ReturnType<typeof scan>>

  beforeAll(async () => {
    // Write the .env fixture file at test time — the root .gitignore excludes
    // .env files from version control, so we create it programmatically to
    // ensure the test is self-contained on any fresh checkout.
    await writeFile(join(FIXTURE_ROOT, '.env'), ENV_FILE_CONTENT, 'utf-8')
    // Clean up any stale .vibegraph cache from previous test runs
    await rm(join(FIXTURE_ROOT, '.vibegraph'), { recursive: true, force: true })
    snapshot = await scan({ root: FIXTURE_ROOT })
  }, 30_000)

  afterAll(async () => {
    await rm(join(FIXTURE_ROOT, '.vibegraph'), { recursive: true, force: true })
    await rm(join(FIXTURE_ROOT, '.env'), { force: true })
  })

  // ── Gate 1: scan() excludes .env from the snapshot ──────────────────────────

  it('scan() produces no file:.env node in the snapshot (DEFAULT_IGNORE_PATTERNS blocks it)', () => {
    const envNodeIds = snapshot.nodes
      .map((n) => n.id)
      .filter((id) => id === 'file:.env' || id.includes('/.env') || id.endsWith('.env'))

    expect(envNodeIds).toEqual([])
  })

  it('scan() produces no node whose id contains .env', () => {
    const envNodes = snapshot.nodes.filter((n) => /\.env/.test(n.id))
    expect(envNodes).toEqual([])
  })

  it('scan() includes src/main.ts as a file node (fixture scanned correctly)', () => {
    const mainNode = snapshot.nodes.find((n) => n.id === 'file:src/main.ts')
    expect(mainNode).toBeDefined()
  })

  // ── Gate 2: buildContextPack() never leaks .env content ─────────────────────

  describe('ContextPack for file:src/main.ts', () => {
    let pack: Awaited<ReturnType<typeof buildContextPack>>

    beforeAll(async () => {
      const loaded = buildLoadedSnapshot(snapshot)
      pack = await buildContextPack(loaded, {
        target: 'file:src/main.ts',
        projectRoot: FIXTURE_ROOT,
        ignore: defaultIgnore,
      })
    })

    it('.env path does not appear in criticalFiles', () => {
      const envFiles = pack.criticalFiles.filter(
        (f) => f.path === '.env' || f.path.includes('.env'),
      )
      expect(envFiles).toEqual([])
    })

    it('no criticalFile excerpt contains .env secret values', () => {
      const allExcerpts = pack.criticalFiles.map((f) => f.excerpt ?? '').join('\n')

      // The .env file written in beforeAll contains these exact strings
      expect(allExcerpts).not.toContain('SECRET=')
      expect(allExcerpts).not.toContain('super-secret-value-that-must-never-appear-in-context-pack')
      expect(allExcerpts).not.toContain('DB_PASSWORD=')
      expect(allExcerpts).not.toContain('another-secret-12345')
      expect(allExcerpts).not.toContain('API_KEY=')
      expect(allExcerpts).not.toContain('sk-test-key-must-not-leak')
    })

    it('ContextPack summary does not mention .env', () => {
      expect(pack.summary).not.toContain('.env')
    })
  })
})
