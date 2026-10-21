// packages/mcp/src/tools/get-blast-radius.test.ts

import { dirname, join } from 'node:path'
import { fileURLToPath } from 'node:url'
import { SnapshotSchema, buildLoadedSnapshot, scan } from '@codearch/core'
import { describe, expect, it } from 'vitest'
import { ToolError } from '../errors.js'
import { GetBlastRadiusTool, buildBlastRadius } from './get-blast-radius.js'

const __dirname = dirname(fileURLToPath(import.meta.url))
const FIXTURE_ROOT = join(__dirname, '../../../../fixtures/synthetic/simple-cycle')

// Synthetic 5-node chain: a→b→c→d→e (a depends on b, etc.)
const makeChainSnap = () =>
  SnapshotSchema.parse({
    meta: {
      schemaVersion: '0.1.0',
      scanId: '11111111-1111-4111-8111-111111111111',
      builtAt: '2026-05-25T00:00:00.000Z',
      projectRoot: '/abs',
      projectName: 'chain',
      vibegraphVersion: '0.0.0',
      scanDurationMs: 1,
      fileCounts: { scanned: 5, indexed: 5, skipped: 0 },
    },
    nodes: [
      { id: 'subsystem:a', kind: 'subsystem', title: 'A' },
      { id: 'subsystem:b', kind: 'subsystem', title: 'B' },
      { id: 'subsystem:c', kind: 'subsystem', title: 'C' },
      { id: 'subsystem:d', kind: 'subsystem', title: 'D' },
      { id: 'subsystem:e', kind: 'subsystem', title: 'E' },
    ],
    edges: [
      {
        id: 'e1',
        from: 'subsystem:a',
        to: 'subsystem:b',
        kind: 'depends_on',
        source: 'derived',
        confidence: 'high',
      },
      {
        id: 'e2',
        from: 'subsystem:b',
        to: 'subsystem:c',
        kind: 'depends_on',
        source: 'derived',
        confidence: 'medium',
      },
      {
        id: 'e3',
        from: 'subsystem:c',
        to: 'subsystem:d',
        kind: 'depends_on',
        source: 'derived',
        confidence: 'high',
      },
      {
        id: 'e4',
        from: 'subsystem:d',
        to: 'subsystem:e',
        kind: 'depends_on',
        source: 'derived',
        confidence: 'low',
      },
    ],
    evidence: [],
    findings: [],
  })

describe('GetBlastRadiusTool metadata', () => {
  it('has name + description + schemas', () => {
    expect(GetBlastRadiusTool.name).toBe('get_blast_radius')
    expect(GetBlastRadiusTool.description).toBeTruthy()
  })
})

describe('buildBlastRadius — chain fixture', () => {
  it('e (leaf) has 4 affected: direct=d, transitive=c,b,a with distances', () => {
    const loaded = buildLoadedSnapshot(makeChainSnap())
    const out = buildBlastRadius(loaded, {
      target: 'subsystem:e',
      maxDepth: 5,
      format: 'compact',
    })
    expect(out.target.nodeId).toBe('subsystem:e')
    expect(out.direct).toHaveLength(1)
    expect(out.direct[0]?.nodeId).toBe('subsystem:d')
    expect(out.direct[0]?.via).toBe('depends_on')
    expect(out.direct[0]?.confidence).toBe('low')
    expect(out.transitive).toHaveLength(3)
    expect(out.transitive.find((t) => t.nodeId === 'subsystem:c')?.distance).toBe(2)
    expect(out.transitive.find((t) => t.nodeId === 'subsystem:b')?.distance).toBe(3)
    expect(out.transitive.find((t) => t.nodeId === 'subsystem:a')?.distance).toBe(4)
    expect(out.cycles).toEqual([])
    expect(out.totalAffected).toBe(4)
  })

  it('c (middle) has direct=b, transitive=a, downstream=none', () => {
    const loaded = buildLoadedSnapshot(makeChainSnap())
    const out = buildBlastRadius(loaded, {
      target: 'subsystem:c',
      maxDepth: 5,
      format: 'compact',
    })
    expect(out.direct).toHaveLength(1)
    expect(out.direct[0]?.nodeId).toBe('subsystem:b')
    expect(out.transitive).toHaveLength(1)
    expect(out.transitive[0]?.nodeId).toBe('subsystem:a')
    expect(out.transitive[0]?.distance).toBe(2)
  })

  it('a (root) has empty radius (nothing consumes it)', () => {
    const loaded = buildLoadedSnapshot(makeChainSnap())
    const out = buildBlastRadius(loaded, {
      target: 'subsystem:a',
      maxDepth: 5,
      format: 'compact',
    })
    expect(out.direct).toEqual([])
    expect(out.transitive).toEqual([])
    expect(out.cycles).toEqual([])
    expect(out.totalAffected).toBe(0)
  })

  it('maxDepth=1 limits transitive to empty', () => {
    const loaded = buildLoadedSnapshot(makeChainSnap())
    const out = buildBlastRadius(loaded, {
      target: 'subsystem:e',
      maxDepth: 1,
      format: 'compact',
    })
    expect(out.direct).toHaveLength(1)
    expect(out.transitive).toEqual([])
  })
})

describe('buildBlastRadius — cycle fixture (simple-cycle)', () => {
  it('produces populated cycles array', async () => {
    const snap = await scan({ root: FIXTURE_ROOT })
    const loaded = buildLoadedSnapshot(snap)
    const out = buildBlastRadius(loaded, {
      target: 'subsystem:auth',
      maxDepth: 5,
      format: 'compact',
    })
    expect(out.cycles).toHaveLength(1)
    expect(out.cycles[0]?.nodeIds.sort()).toEqual(['subsystem:billing'])
  }, 30_000)
})

describe('buildBlastRadius — errors', () => {
  it('throws TARGET_NOT_FOUND for unknown target', () => {
    const loaded = buildLoadedSnapshot(makeChainSnap())
    expect(() =>
      buildBlastRadius(loaded, { target: 'subsystem:nope', maxDepth: 5, format: 'compact' }),
    ).toThrow(ToolError)
  })

  it('supports kind:slug shorthand', () => {
    const loaded = buildLoadedSnapshot(makeChainSnap())
    const out = buildBlastRadius(loaded, { target: 'e', maxDepth: 5, format: 'compact' })
    expect(out.target.nodeId).toBe('subsystem:e')
  })
})
