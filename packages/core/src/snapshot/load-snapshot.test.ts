import { describe, expect, it } from 'vitest'
import { SnapshotSchema } from '../schema/snapshot.js'
import { buildLoadedSnapshot } from './load-snapshot.js'

const validMeta = {
  schemaVersion: '0.1.0' as const,
  scanId: '11111111-1111-4111-8111-111111111111',
  builtAt: '2026-05-24T10:00:00.000Z',
  projectRoot: '/abs',
  projectName: 'demo',
  vibegraphVersion: '0.1.0',
  scanDurationMs: 1,
  fileCounts: { scanned: 1, indexed: 1, skipped: 0 },
}

const snap = SnapshotSchema.parse({
  meta: validMeta,
  nodes: [
    { id: 'subsystem:a', kind: 'subsystem', title: 'A' },
    { id: 'subsystem:b', kind: 'subsystem', title: 'B' },
  ],
  edges: [
    {
      id: 'a->b:imports',
      from: 'subsystem:a',
      to: 'subsystem:b',
      kind: 'imports',
      source: 'ast',
      confidence: 'high',
      evidenceIds: ['ev_1'],
    },
  ],
  evidence: [
    { id: 'ev_1', sourceKind: 'ast', file: 'a.ts', detail: "import 'b'", confidence: 'high' },
  ],
  findings: [
    {
      id: 'fnd_1',
      domain: 'architecture',
      type: 'cycle',
      detectorId: 'core/cycles',
      severity: 'high',
      title: 'x',
      summary: 'y',
      involvedNodeIds: ['subsystem:a'],
    },
  ],
})

describe('buildLoadedSnapshot', () => {
  it('builds nodesById, edgesByNodeId, edgesByTargetId, evidenceById, findingsByNodeId', () => {
    const loaded = buildLoadedSnapshot(snap)
    expect(loaded.nodesById.get('subsystem:a')?.title).toBe('A')
    expect(loaded.edgesByNodeId.get('subsystem:a')).toHaveLength(1)
    expect(loaded.edgesByTargetId.get('subsystem:b')).toHaveLength(1)
    expect(loaded.evidenceById.get('ev_1')?.file).toBe('a.ts')
    expect(loaded.findingsByNodeId.get('subsystem:a')).toHaveLength(1)
  })

  it('exposes the raw snapshot unchanged', () => {
    const loaded = buildLoadedSnapshot(snap)
    expect(loaded.raw).toBe(snap)
  })
})
