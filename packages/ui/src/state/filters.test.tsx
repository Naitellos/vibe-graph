import { afterEach, describe, expect, it } from 'vitest'
import { useFiltersStore } from './filters.js'

const DEFAULTS = {
  layer: 'all' as const,
  edgeKind: 'all' as const,
  coupling: 'all' as const,
  confidence: 'all' as const,
  showExternal: false,
}

describe('useFiltersStore', () => {
  afterEach(() => {
    useFiltersStore.getState().reset()
  })

  describe('default state', () => {
    it('layer defaults to "all"', () => {
      expect(useFiltersStore.getState().layer).toBe('all')
    })
    it('edgeKind defaults to "all"', () => {
      expect(useFiltersStore.getState().edgeKind).toBe('all')
    })
    it('coupling defaults to "all"', () => {
      expect(useFiltersStore.getState().coupling).toBe('all')
    })
    it('confidence defaults to "all"', () => {
      expect(useFiltersStore.getState().confidence).toBe('all')
    })
    it('showExternal defaults to false', () => {
      expect(useFiltersStore.getState().showExternal).toBe(false)
    })
  })

  describe('setters', () => {
    it('setLayer updates layer', () => {
      useFiltersStore.getState().setLayer('domain')
      expect(useFiltersStore.getState().layer).toBe('domain')
    })
    it('setEdgeKind updates edgeKind', () => {
      useFiltersStore.getState().setEdgeKind('imports')
      expect(useFiltersStore.getState().edgeKind).toBe('imports')
    })
    it('setCoupling updates coupling', () => {
      useFiltersStore.getState().setCoupling('runtime')
      expect(useFiltersStore.getState().coupling).toBe('runtime')
    })
    it('setConfidence updates confidence', () => {
      useFiltersStore.getState().setConfidence('high')
      expect(useFiltersStore.getState().confidence).toBe('high')
    })
    it('setShowExternal updates showExternal', () => {
      useFiltersStore.getState().setShowExternal(true)
      expect(useFiltersStore.getState().showExternal).toBe(true)
    })
  })

  describe('reset', () => {
    it('reset restores all defaults after changes', () => {
      const s = useFiltersStore.getState()
      s.setLayer('infra')
      s.setEdgeKind('contains')
      s.setCoupling('type-only')
      s.setConfidence('low')
      s.setShowExternal(true)
      s.reset()
      const state = useFiltersStore.getState()
      expect(state.layer).toBe(DEFAULTS.layer)
      expect(state.edgeKind).toBe(DEFAULTS.edgeKind)
      expect(state.coupling).toBe(DEFAULTS.coupling)
      expect(state.confidence).toBe(DEFAULTS.confidence)
      expect(state.showExternal).toBe(DEFAULTS.showExternal)
    })
  })
})
