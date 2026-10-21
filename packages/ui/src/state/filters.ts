import type { Confidence, EdgeKind, EvidenceCoupling, Layer } from '@codearch/core'
import { create } from 'zustand'

export type LayerFilter = Layer | 'all'
export type EdgeKindFilter = EdgeKind | 'all'
export type CouplingFilter = EvidenceCoupling | 'all'
export type ConfidenceFilter = Confidence | 'all'

export interface FiltersState {
  layer: LayerFilter
  edgeKind: EdgeKindFilter
  coupling: CouplingFilter
  confidence: ConfidenceFilter
  showExternal: boolean
  setLayer: (v: LayerFilter) => void
  setEdgeKind: (v: EdgeKindFilter) => void
  setCoupling: (v: CouplingFilter) => void
  setConfidence: (v: ConfidenceFilter) => void
  setShowExternal: (v: boolean) => void
  reset: () => void
}

const DEFAULTS = {
  layer: 'all' as LayerFilter,
  edgeKind: 'all' as EdgeKindFilter,
  coupling: 'all' as CouplingFilter,
  confidence: 'all' as ConfidenceFilter,
  showExternal: false,
}

export const useFiltersStore = create<FiltersState>((set) => ({
  ...DEFAULTS,
  setLayer: (v) => set({ layer: v }),
  setEdgeKind: (v) => set({ edgeKind: v }),
  setCoupling: (v) => set({ coupling: v }),
  setConfidence: (v) => set({ confidence: v }),
  setShowExternal: (v) => set({ showExternal: v }),
  reset: () => set({ ...DEFAULTS }),
}))
