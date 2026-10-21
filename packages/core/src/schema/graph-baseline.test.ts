import { describe, expect, it } from 'vitest'
import { GraphBaselineSchema } from './graph-baseline.js'

describe('GraphBaselineSchema', () => {
  it('parses a valid baseline shape', () => {
    const valid = {
      schemaVersion: '1.0',
      snapshotId: 'scan_abc123',
      createdAt: '2026-05-27T00:00:00.000Z',
      fingerprint: 'sha256:deadbeef',
      nodes: [],
      edges: [],
      findings: [],
    }
    const parsed = GraphBaselineSchema.parse(valid)
    expect(parsed.snapshotId).toBe('scan_abc123')
    expect(parsed.fingerprint).toBe('sha256:deadbeef')
  })

  it('rejects baseline missing snapshotId', () => {
    const invalid = {
      schemaVersion: '1.0',
      createdAt: '2026-05-27T00:00:00.000Z',
      fingerprint: 'sha256:x',
      nodes: [],
      edges: [],
      findings: [],
    }
    expect(() => GraphBaselineSchema.parse(invalid)).toThrow()
  })

  it('rejects malformed createdAt', () => {
    const invalid = {
      schemaVersion: '1.0',
      snapshotId: 'scan_x',
      createdAt: 'yesterday',
      fingerprint: 'sha256:x',
      nodes: [],
      edges: [],
      findings: [],
    }
    expect(() => GraphBaselineSchema.parse(invalid)).toThrow()
  })

  it('defaults schemaVersion to "1.0" when omitted', () => {
    const parsed = GraphBaselineSchema.parse({
      snapshotId: 'scan_x',
      createdAt: '2026-05-27T00:00:00.000Z',
      fingerprint: 'sha256:x',
      nodes: [],
      edges: [],
      findings: [],
    })
    expect(parsed.schemaVersion).toBe('1.0')
  })
})
