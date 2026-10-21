import { describe, expect, it } from 'vitest'
import { RuleSchema } from '../../schema/rule.js'
import { noLayerViolationPreset } from './no-layer-violation.js'

describe('noLayerViolationPreset', () => {
  it('has kind edge-pattern and correct id', () => {
    expect(noLayerViolationPreset.kind).toBe('edge-pattern')
    expect(noLayerViolationPreset.id).toBe('builtin:no-layer-violation')
  })

  it('matches domain → horizontal layer pattern', () => {
    expect(noLayerViolationPreset.from).toEqual({ layer: 'domain' })
    expect(noLayerViolationPreset.to).toEqual({ layer: 'horizontal' })
  })

  it('has depends_on relation and forbidden: true', () => {
    expect(noLayerViolationPreset.relation).toBe('depends_on')
    expect(noLayerViolationPreset.forbidden).toBe(true)
  })

  it('has severity medium and mode advisory', () => {
    expect(noLayerViolationPreset.severity).toBe('medium')
    expect(noLayerViolationPreset.mode).toBe('advisory')
  })

  it('is a valid Rule per RuleSchema.parse', () => {
    const parsed = RuleSchema.parse(noLayerViolationPreset)
    expect(parsed.kind).toBe('edge-pattern')
  })
})
