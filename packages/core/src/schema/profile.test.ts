import { describe, expect, it } from 'vitest'
import { EdgeKindSchema, LayerSchema, NodeKindSchema } from './common.js'
import { CODE_PROFILE, getDomainProfile } from './profile.js'

describe('DomainProfile seam (§8.1)', () => {
  it('exposes the code profile with the current enum vocabulary', () => {
    expect(getDomainProfile('code')).toBe(CODE_PROFILE)
    expect(CODE_PROFILE.nodeKinds).toEqual(NodeKindSchema.options)
    expect(CODE_PROFILE.edgeKinds).toEqual(EdgeKindSchema.options)
    expect(CODE_PROFILE.layers).toEqual(LayerSchema.options)
    // зарезервированные kind'ы будущего 1.5 уже в словаре кода:
    expect(CODE_PROFILE.nodeKinds).toContain('adr')
    expect(CODE_PROFILE.edgeKinds).toContain('references')
  })

  it('throws a listing error on unknown profile ids', () => {
    expect(() => getDomainProfile('knowledge')).toThrow(/Unknown domain profile: knowledge/)
  })
})
