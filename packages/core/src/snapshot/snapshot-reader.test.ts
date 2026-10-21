import { mkdtempSync, realpathSync } from 'node:fs'
import { writeFile } from 'node:fs/promises'
import { tmpdir } from 'node:os'
import { join } from 'node:path'
import { describe, expect, it } from 'vitest'
import { SnapshotSchema } from '../schema/snapshot.js'
import { writeSnapshotAtomic } from './atomic-writer.js'
import { createSnapshotReader } from './snapshot-reader.js'

function mkTmp(): string {
  return realpathSync(mkdtempSync(join(tmpdir(), 'vg-reader-')))
}

const validSnapshot = SnapshotSchema.parse({
  meta: {
    schemaVersion: '0.1.0' as const,
    scanId: '11111111-1111-4111-8111-111111111111',
    builtAt: '2026-05-24T00:00:00.000Z',
    projectRoot: '/abs',
    projectName: 'demo',
    vibegraphVersion: '0.0.0',
    scanDurationMs: 1,
    fileCounts: { scanned: 0, indexed: 0, skipped: 0 },
  },
  nodes: [],
  edges: [],
  evidence: [],
  findings: [],
})

describe('createSnapshotReader', () => {
  it('throws SNAPSHOT_MISSING when file absent and autoScan disabled', async () => {
    const dir = mkTmp()
    const reader = createSnapshotReader({
      snapshotPath: join(dir, 'graph.json'),
      autoScanOnMissing: false,
    })
    await expect(reader.get()).rejects.toMatchObject({ code: 'SNAPSHOT_MISSING' })
  })

  it('returns LoadedSnapshot when file is valid', async () => {
    const dir = mkTmp()
    const path = join(dir, 'graph.json')
    await writeSnapshotAtomic(path, validSnapshot)
    const reader = createSnapshotReader({ snapshotPath: path, autoScanOnMissing: false })
    const loaded = await reader.get()
    expect(loaded.raw.meta.projectName).toBe('demo')
  })

  it('returns cached LoadedSnapshot when scanId unchanged', async () => {
    const dir = mkTmp()
    const path = join(dir, 'graph.json')
    await writeSnapshotAtomic(path, validSnapshot)
    const reader = createSnapshotReader({ snapshotPath: path, autoScanOnMissing: false })
    const a = await reader.get()
    const b = await reader.get()
    expect(b).toBe(a)
  })

  it('reloads when scanId differs', async () => {
    const dir = mkTmp()
    const path = join(dir, 'graph.json')
    await writeSnapshotAtomic(path, validSnapshot)
    const reader = createSnapshotReader({ snapshotPath: path, autoScanOnMissing: false })
    const a = await reader.get()
    const newer = {
      ...validSnapshot,
      meta: { ...validSnapshot.meta, scanId: '22222222-2222-4222-8222-222222222222' },
    }
    await new Promise((r) => setTimeout(r, 10))
    await writeSnapshotAtomic(path, newer)
    const b = await reader.get()
    expect(b).not.toBe(a)
    expect(b.raw.meta.scanId).toBe('22222222-2222-4222-8222-222222222222')
  })

  it('throws SNAPSHOT_CORRUPT on invalid JSON', async () => {
    const dir = mkTmp()
    const path = join(dir, 'graph.json')
    await writeFile(path, 'not json', 'utf-8')
    const reader = createSnapshotReader({ snapshotPath: path, autoScanOnMissing: false })
    await expect(reader.get()).rejects.toMatchObject({ code: 'SNAPSHOT_CORRUPT' })
  })

  it('throws SNAPSHOT_CORRUPT on schema-invalid JSON', async () => {
    const dir = mkTmp()
    const path = join(dir, 'graph.json')
    await writeFile(path, JSON.stringify({ meta: {} }), 'utf-8')
    const reader = createSnapshotReader({ snapshotPath: path, autoScanOnMissing: false })
    await expect(reader.get()).rejects.toMatchObject({ code: 'SNAPSHOT_CORRUPT' })
  })
})
