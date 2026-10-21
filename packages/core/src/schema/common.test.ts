import { describe, expect, it } from 'vitest'
import {
  ConfidenceSchema,
  EdgeCategorySchema,
  EdgeKindSchema,
  EvidenceCouplingSchema,
  FindingDomainSchema,
  LayerSchema,
  NodeKindSchema,
  SeveritySchema,
  StatusSchema,
} from './common.js'

describe('common enums', () => {
  it('NodeKindSchema accepts all v0 kinds and rejects unknown', () => {
    expect(NodeKindSchema.parse('subsystem')).toBe('subsystem')
    expect(NodeKindSchema.parse('file')).toBe('file')
    expect(NodeKindSchema.parse('package')).toBe('package')
    expect(NodeKindSchema.parse('external')).toBe('external')
    expect(NodeKindSchema.parse('project')).toBe('project')
    expect(() => NodeKindSchema.parse('nonsense')).toThrow()
  })

  it('EdgeKindSchema accepts dependency and relationship kinds', () => {
    for (const kind of ['imports', 'depends_on', 'calls', 'contains', 'owns']) {
      expect(EdgeKindSchema.parse(kind)).toBe(kind)
    }
    expect(() => EdgeKindSchema.parse('bogus')).toThrow()
  })

  it('EvidenceCouplingSchema accepts runtime/type-only/dynamic/reexport', () => {
    expect(EvidenceCouplingSchema.parse('runtime')).toBe('runtime')
    expect(EvidenceCouplingSchema.parse('type-only')).toBe('type-only')
    expect(EvidenceCouplingSchema.parse('dynamic')).toBe('dynamic')
    expect(EvidenceCouplingSchema.parse('reexport')).toBe('reexport')
  })

  it('ConfidenceSchema accepts only high/medium/low', () => {
    expect(ConfidenceSchema.parse('high')).toBe('high')
    expect(() => ConfidenceSchema.parse('extreme')).toThrow()
  })

  it('SeveritySchema accepts low/medium/high', () => {
    expect(SeveritySchema.parse('low')).toBe('low')
    expect(() => SeveritySchema.parse('critical')).toThrow()
  })

  it('LayerSchema accepts canonical layers', () => {
    for (const l of ['domain', 'horizontal', 'infra', 'external', 'unknown']) {
      expect(LayerSchema.parse(l)).toBe(l)
    }
  })

  it('StatusSchema accepts canonical statuses', () => {
    for (const s of ['shipped', 'in-progress', 'direction', 'pointer-only', 'unknown']) {
      expect(StatusSchema.parse(s)).toBe(s)
    }
  })

  it('EdgeCategorySchema accepts structural/domain/infra/external', () => {
    for (const c of ['structural', 'domain', 'infra', 'external']) {
      expect(EdgeCategorySchema.parse(c)).toBe(c)
    }
  })

  it('FindingDomainSchema accepts architecture/security/docs/tests/drift/rule', () => {
    for (const d of ['architecture', 'security', 'docs', 'tests', 'drift', 'rule']) {
      expect(FindingDomainSchema.parse(d)).toBe(d)
    }
    expect(() => FindingDomainSchema.parse('unknown-domain')).toThrow()
  })
})
