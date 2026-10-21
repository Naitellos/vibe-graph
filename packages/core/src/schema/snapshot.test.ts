import { describe, expect, it } from 'vitest'
import { SCHEMA_VERSION, SnapshotMetaSchema, SnapshotSchema } from './snapshot.js'

const validMeta = {
  schemaVersion: SCHEMA_VERSION,
  scanId: '11111111-1111-4111-8111-111111111111',
  builtAt: '2026-05-24T10:00:00.000Z',
  projectRoot: '/abs/path/to/project',
  projectName: 'demo',
  vibegraphVersion: '0.1.0',
  scanDurationMs: 1234,
  fileCounts: { scanned: 100, indexed: 95, skipped: 5 },
}

describe('SnapshotMetaSchema', () => {
  it('parses a valid meta', () => {
    expect(SnapshotMetaSchema.parse(validMeta)).toMatchObject(validMeta)
  })

  it('rejects mismatched schemaVersion', () => {
    expect(() => SnapshotMetaSchema.parse({ ...validMeta, schemaVersion: '99.99.99' })).toThrow()
  })

  it('rejects non-UUID scanId', () => {
    expect(() => SnapshotMetaSchema.parse({ ...validMeta, scanId: 'not-a-uuid' })).toThrow()
  })
})

describe('SnapshotSchema', () => {
  it('parses an empty snapshot envelope', () => {
    const snap = SnapshotSchema.parse({
      meta: validMeta,
      nodes: [],
      edges: [],
      evidence: [],
      findings: [],
    })
    expect(snap.nodes).toEqual([])
    expect(snap.meta.projectName).toBe('demo')
  })

  it('parses a snapshot with one node and edge', () => {
    const snap = SnapshotSchema.parse({
      meta: validMeta,
      nodes: [
        { id: 'subsystem:oracle', kind: 'subsystem', title: 'Oracle' },
        { id: 'subsystem:energy', kind: 'subsystem', title: 'Energy' },
      ],
      edges: [
        {
          id: 'oracle->energy:imports',
          from: 'subsystem:oracle',
          to: 'subsystem:energy',
          kind: 'imports',
          source: 'ast',
          confidence: 'high',
        },
      ],
      evidence: [],
      findings: [],
    })
    expect(snap.nodes).toHaveLength(2)
    expect(snap.edges).toHaveLength(1)
  })
})
