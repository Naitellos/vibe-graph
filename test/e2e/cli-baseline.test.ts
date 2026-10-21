import { spawnSync } from 'node:child_process'
import { randomUUID } from 'node:crypto'
import { mkdir, readFile, rm, writeFile } from 'node:fs/promises'
import { tmpdir } from 'node:os'
import { dirname, join, resolve } from 'node:path'
import { fileURLToPath } from 'node:url'
import { afterEach, beforeEach, describe, expect, it } from 'vitest'

// Note: build is handled in test/e2e/global-setup.ts

const __dirname = dirname(fileURLToPath(import.meta.url))
const repoRoot = resolve(__dirname, '../..')
const CLI = join(repoRoot, 'packages', 'cli', 'dist', 'bin.js')

describe('e2e: vibe-graph baseline', () => {
  let tmpRoot: string

  beforeEach(async () => {
    tmpRoot = join(tmpdir(), `vg-e2e-baseline-${Date.now()}-${Math.random()}`)
    await mkdir(join(tmpRoot, '.vibegraph', 'cache'), { recursive: true })
  })

  afterEach(async () => {
    await rm(tmpRoot, { recursive: true, force: true })
  })

  /**
   * Writes a realistic Snapshot (matching SnapshotSchema) to graph.json.
   * Returns the UUID used as scanId so callers can assert against it.
   */
  async function seedSnapshot(): Promise<string> {
    const graphPath = join(tmpRoot, '.vibegraph', 'cache', 'graph.json')
    const scanId = randomUUID()
    const snapshot = {
      meta: {
        schemaVersion: '0.1.0',
        scanId,
        builtAt: '2026-05-27T00:00:00.000Z',
        projectRoot: tmpRoot,
        projectName: 'e2e',
        vibegraphVersion: '0.0.0',
        scanDurationMs: 0,
        fileCounts: { scanned: 0, indexed: 0, skipped: 0 },
      },
      nodes: [],
      edges: [],
      evidence: [],
      findings: [],
    }
    await writeFile(graphPath, `${JSON.stringify(snapshot)}\n`, 'utf-8')
    return scanId
  }

  async function readCache(name: string) {
    return JSON.parse(await readFile(join(tmpRoot, '.vibegraph', 'cache', name), 'utf-8'))
  }

  it('scans first, writes baseline.json from the fresh snapshot and exits 0', async () => {
    await mkdir(join(tmpRoot, 'src'), { recursive: true })
    await writeFile(join(tmpRoot, 'src', 'a.ts'), 'export const a = 1\n', 'utf-8')
    const result = spawnSync('node', [CLI, 'baseline', '--root', tmpRoot, '--json'], {
      encoding: 'utf-8',
    })
    expect(result.status).toBe(0)
    const graph = await readCache('graph.json')
    const parsed = await readCache('baseline.json')
    expect(parsed.snapshotId).toBe(graph.meta.scanId)
    expect(result.stdout + result.stderr).toContain(graph.meta.scanId)
    expect(parsed.fingerprint).toMatch(/^sha256:[a-f0-9]{64}$/)
  })

  it('replaces a stale graph.json instead of baselining it', async () => {
    const staleScanId = await seedSnapshot()
    const result = spawnSync('node', [CLI, 'baseline', '--root', tmpRoot, '--json'], {
      encoding: 'utf-8',
    })
    expect(result.status).toBe(0)
    const parsed = await readCache('baseline.json')
    expect(parsed.snapshotId).not.toBe(staleScanId)
    expect(parsed.snapshotId).toBe((await readCache('graph.json')).meta.scanId)
  })
})
