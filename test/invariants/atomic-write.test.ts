/**
 * Invariant: writeSnapshotAtomic + createSnapshotReader round-trip.
 *
 * Proves that data written with writeSnapshotAtomic is faithfully
 * recovered by createSnapshotReader — nodes, edges, meta, and findings
 * are all preserved (deep equality on key fields).
 */
import { mkdtempSync, realpathSync } from 'node:fs'
import { rm } from 'node:fs/promises'
import { tmpdir } from 'node:os'
import { join } from 'node:path'
import { afterEach, beforeEach, describe, expect, it } from 'vitest'
import { SnapshotSchema } from '../../packages/core/src/schema/snapshot.js'
import { writeSnapshotAtomic } from '../../packages/core/src/snapshot/atomic-writer.js'
import { createSnapshotReader } from '../../packages/core/src/snapshot/snapshot-reader.js'

// ── Fixture snapshot ──────────────────────────────────────────────────────────

const fixtureSnapshot = SnapshotSchema.parse({
  meta: {
    schemaVersion: '0.1.0' as const,
    scanId: 'aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa',
    builtAt: '2026-05-25T00:00:00.000Z',
    projectRoot: '/invariants-roundtrip',
    projectName: 'invariants-roundtrip',
    vibegraphVersion: '0.0.0',
    scanDurationMs: 42,
    fileCounts: { scanned: 2, indexed: 2, skipped: 0 },
  },
  nodes: [
    {
      id: 'file:src/a.ts',
      kind: 'file',
      title: 'src/a.ts',
      layer: 'domain',
      status: 'shipped',
      tags: ['core'],
      files: ['src/a.ts'],
      metadata: {},
    },
    {
      id: 'file:src/b.ts',
      kind: 'file',
      title: 'src/b.ts',
      layer: 'domain',
      status: 'shipped',
      tags: [],
      files: ['src/b.ts'],
      metadata: {},
    },
  ],
  edges: [
    {
      id: 'edge:src/a.ts:src/b.ts:imports',
      from: 'file:src/a.ts',
      to: 'file:src/b.ts',
      kind: 'imports',
      category: 'structural',
      source: 'ast',
      confidence: 'high',
      evidenceIds: [],
      weight: 1,
      runtimeWeight: 0,
      typeOnlyWeight: 0,
      dynamicWeight: 0,
      metadata: {},
    },
  ],
  evidence: [],
  findings: [],
})

// ── Tests ─────────────────────────────────────────────────────────────────────

describe('invariant: writeSnapshotAtomic + createSnapshotReader round-trip', () => {
  let tmpDir: string

  beforeEach(() => {
    tmpDir = realpathSync(mkdtempSync(join(tmpdir(), 'vg-invariants-')))
  })

  afterEach(async () => {
    await rm(tmpDir, { recursive: true, force: true })
  })

  it('read-back snapshot has the same meta as written', async () => {
    const path = join(tmpDir, 'graph.json')
    await writeSnapshotAtomic(path, fixtureSnapshot)

    const reader = createSnapshotReader({ snapshotPath: path, autoScanOnMissing: false })
    const loaded = await reader.get()

    expect(loaded.raw.meta.scanId).toBe(fixtureSnapshot.meta.scanId)
    expect(loaded.raw.meta.projectName).toBe(fixtureSnapshot.meta.projectName)
    expect(loaded.raw.meta.projectRoot).toBe(fixtureSnapshot.meta.projectRoot)
    expect(loaded.raw.meta.scanDurationMs).toBe(fixtureSnapshot.meta.scanDurationMs)
  })

  it('read-back nodes match written nodes (deep equality)', async () => {
    const path = join(tmpDir, 'graph.json')
    await writeSnapshotAtomic(path, fixtureSnapshot)

    const reader = createSnapshotReader({ snapshotPath: path, autoScanOnMissing: false })
    const loaded = await reader.get()

    expect(loaded.raw.nodes).toEqual(fixtureSnapshot.nodes)
  })

  it('read-back edges match written edges (deep equality)', async () => {
    const path = join(tmpDir, 'graph.json')
    await writeSnapshotAtomic(path, fixtureSnapshot)

    const reader = createSnapshotReader({ snapshotPath: path, autoScanOnMissing: false })
    const loaded = await reader.get()

    expect(loaded.raw.edges).toEqual(fixtureSnapshot.edges)
  })

  it('loaded snapshot indexes are correct after round-trip', async () => {
    const path = join(tmpDir, 'graph.json')
    await writeSnapshotAtomic(path, fixtureSnapshot)

    const reader = createSnapshotReader({ snapshotPath: path, autoScanOnMissing: false })
    const loaded = await reader.get()

    // nodesById should contain both nodes
    expect(loaded.nodesById.has('file:src/a.ts')).toBe(true)
    expect(loaded.nodesById.has('file:src/b.ts')).toBe(true)

    // edgesByTargetId: file:src/b.ts is the target of the edge
    const incoming = loaded.edgesByTargetId.get('file:src/b.ts')
    expect(incoming).toBeDefined()
    expect(incoming?.length).toBe(1)
    expect(incoming?.[0]?.from).toBe('file:src/a.ts')
  })
})
