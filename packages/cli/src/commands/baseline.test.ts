import { randomUUID } from 'node:crypto'
import { mkdir, mkdtemp, readFile, rm, writeFile } from 'node:fs/promises'
import { tmpdir } from 'node:os'
import { join } from 'node:path'
import { afterEach, beforeEach, describe, expect, it } from 'vitest'
import { baselineCommand, runBaseline } from './baseline.js'

describe('runBaseline', () => {
  let tmpRoot: string

  beforeEach(async () => {
    tmpRoot = join(tmpdir(), `vg-cli-baseline-${Date.now()}-${Math.random()}`)
    await mkdir(join(tmpRoot, '.vibegraph', 'cache'), { recursive: true })
  })

  afterEach(async () => {
    await rm(tmpRoot, { recursive: true, force: true })
  })

  /**
   * Writes a realistic Snapshot (matching SnapshotSchema) to graph.json.
   * Returns the UUID used as scanId so callers can assert against it.
   */
  async function seedSnapshot(scanId = randomUUID()): Promise<string> {
    const graphPath = join(tmpRoot, '.vibegraph', 'cache', 'graph.json')
    const snapshot = {
      meta: {
        schemaVersion: '0.1.0',
        scanId,
        builtAt: '2026-05-27T00:00:00.000Z',
        projectRoot: tmpRoot,
        projectName: 'test',
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

  it('writes baseline.json from the current snapshot', async () => {
    const scanId = await seedSnapshot()
    const result = await runBaseline({ projectRoot: tmpRoot })
    expect(result.status).toBe('ok')
    const baselinePath = join(tmpRoot, '.vibegraph', 'cache', 'baseline.json')
    const raw = await readFile(baselinePath, 'utf-8')
    const parsed = JSON.parse(raw)
    expect(parsed.snapshotId).toBe(scanId)
    expect(parsed.schemaVersion).toBe('1.0')
    expect(parsed.fingerprint).toMatch(/^sha256:/)
  })

  it('fails clearly when no snapshot exists', async () => {
    const result = await runBaseline({ projectRoot: tmpRoot })
    expect(result.status).toBe('error')
    expect(result.error).toContain('graph.json')
  })

  it('fails clearly when graph.json is not a valid Snapshot', async () => {
    const graphPath = join(tmpRoot, '.vibegraph', 'cache', 'graph.json')
    await writeFile(graphPath, '{}\n', 'utf-8')

    const result = await runBaseline({ projectRoot: tmpRoot })
    expect(result.status).toBe('error')
    expect(result.error).toContain('Vibe Graph snapshot')
    expect(result.error).toContain('vibe-graph scan')
  })

  it('overwrites previous baseline atomically', async () => {
    await seedSnapshot()
    await runBaseline({ projectRoot: tmpRoot })
    const scanIdV2 = await seedSnapshot()
    const result = await runBaseline({ projectRoot: tmpRoot })
    expect(result.status).toBe('ok')
    const baselinePath = join(tmpRoot, '.vibegraph', 'cache', 'baseline.json')
    const parsed = JSON.parse(await readFile(baselinePath, 'utf-8'))
    expect(parsed.snapshotId).toBe(scanIdV2)
  })
})

describe('baselineCommand', () => {
  let root: string

  beforeEach(async () => {
    root = await mkdtemp(join(tmpdir(), 'vg-cli-baseline-cmd-'))
    await mkdir(join(root, 'src'), { recursive: true })
    await writeFile(join(root, 'src', 'a.ts'), 'export const a = 1\n', 'utf-8')
  })

  afterEach(async () => {
    await rm(root, { recursive: true, force: true })
  })

  async function runCommand(): Promise<void> {
    await baselineCommand.run?.({
      args: { root, json: false, quiet: true },
      cmd: baselineCommand,
    })
  }

  async function readCache(name: string) {
    return JSON.parse(await readFile(join(root, '.vibegraph', 'cache', name), 'utf-8'))
  }

  // The hook nudge tells the user to run `vibe-graph baseline`; that has to work
  // on its own, without a prior `vibe-graph scan`.
  it('scans first, so it works without a prior scan', async () => {
    const prevCode = process.exitCode
    process.exitCode = undefined
    try {
      await runCommand()
      expect(process.exitCode ?? 0).toBe(0)
      const graph = await readCache('graph.json')
      const baseline = await readCache('baseline.json')
      expect(baseline.snapshotId).toBe(graph.meta.scanId)
    } finally {
      process.exitCode = prevCode
    }
  })

  // A graph.json left over from an old scan would make every later edit report
  // the whole drift since then as "new".
  it('re-scans instead of baselining a stale graph.json', async () => {
    const staleScanId = randomUUID()
    await mkdir(join(root, '.vibegraph', 'cache'), { recursive: true })
    await writeFile(
      join(root, '.vibegraph', 'cache', 'graph.json'),
      `${JSON.stringify({
        meta: {
          schemaVersion: '0.1.0',
          scanId: staleScanId,
          builtAt: '2026-05-27T00:00:00.000Z',
          projectRoot: root,
          projectName: 'stale',
          vibegraphVersion: '0.0.0',
          scanDurationMs: 0,
          fileCounts: { scanned: 0, indexed: 0, skipped: 0 },
        },
        nodes: [],
        edges: [],
        evidence: [],
        findings: [],
      })}\n`,
      'utf-8',
    )
    const prevCode = process.exitCode
    process.exitCode = undefined
    try {
      await runCommand()
      expect(process.exitCode ?? 0).toBe(0)
      const baseline = await readCache('baseline.json')
      expect(baseline.snapshotId).not.toBe(staleScanId)
      expect(baseline.snapshotId).toBe((await readCache('graph.json')).meta.scanId)
    } finally {
      process.exitCode = prevCode
    }
  })
})
