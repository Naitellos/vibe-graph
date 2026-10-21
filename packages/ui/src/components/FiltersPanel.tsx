import type React from 'react'
import type {
  ConfidenceFilter,
  CouplingFilter,
  EdgeKindFilter,
  LayerFilter,
} from '../state/filters.js'
import { useFiltersStore } from '../state/filters.js'

const LAYER_OPTIONS: LayerFilter[] = ['all', 'domain', 'horizontal', 'infra', 'external', 'unknown']
const EDGE_KIND_OPTIONS: EdgeKindFilter[] = ['all', 'imports', 'depends_on', 'contains']
const COUPLING_OPTIONS: CouplingFilter[] = ['all', 'runtime', 'type-only', 'dynamic', 'reexport']
const CONFIDENCE_OPTIONS: ConfidenceFilter[] = ['all', 'high', 'medium', 'low']

function capitalize(value: string): string {
  if (value === 'all') return 'All'
  return value
    .split('-')
    .map((part) => part.charAt(0).toUpperCase() + part.slice(1))
    .join('-')
    .replace('_', ' ')
    .split(' ')
    .map((part) => part.charAt(0).toUpperCase() + part.slice(1))
    .join(' ')
}

export function FiltersPanel(): React.JSX.Element {
  const layer = useFiltersStore((s) => s.layer)
  const edgeKind = useFiltersStore((s) => s.edgeKind)
  const coupling = useFiltersStore((s) => s.coupling)
  const confidence = useFiltersStore((s) => s.confidence)
  const showExternal = useFiltersStore((s) => s.showExternal)

  function handleLayerChange(e: React.ChangeEvent<HTMLSelectElement>): void {
    useFiltersStore.getState().setLayer(e.target.value as LayerFilter)
  }

  function handleEdgeKindChange(e: React.ChangeEvent<HTMLSelectElement>): void {
    useFiltersStore.getState().setEdgeKind(e.target.value as EdgeKindFilter)
  }

  function handleCouplingChange(e: React.ChangeEvent<HTMLSelectElement>): void {
    useFiltersStore.getState().setCoupling(e.target.value as CouplingFilter)
  }

  function handleConfidenceChange(e: React.ChangeEvent<HTMLSelectElement>): void {
    useFiltersStore.getState().setConfidence(e.target.value as ConfidenceFilter)
  }

  function handleShowExternalChange(e: React.ChangeEvent<HTMLInputElement>): void {
    useFiltersStore.getState().setShowExternal(e.target.checked)
  }

  function handleReset(): void {
    useFiltersStore.getState().reset()
  }

  return (
    <div
      data-testid="filters-panel"
      style={{ display: 'flex', flexDirection: 'column', gap: '8px', padding: '8px' }}
    >
      <div>
        <label htmlFor="filter-layer">Layer:</label>
        <select id="filter-layer" value={layer} onChange={handleLayerChange}>
          {LAYER_OPTIONS.map((opt) => (
            <option key={opt} value={opt}>
              {capitalize(opt)}
            </option>
          ))}
        </select>
      </div>

      <div>
        <label htmlFor="filter-edge-kind">Edge Kind:</label>
        <select id="filter-edge-kind" value={edgeKind} onChange={handleEdgeKindChange}>
          {EDGE_KIND_OPTIONS.map((opt) => (
            <option key={opt} value={opt}>
              {capitalize(opt)}
            </option>
          ))}
        </select>
      </div>

      <div>
        <label htmlFor="filter-coupling">Coupling:</label>
        <select id="filter-coupling" value={coupling} onChange={handleCouplingChange}>
          {COUPLING_OPTIONS.map((opt) => (
            <option key={opt} value={opt}>
              {capitalize(opt)}
            </option>
          ))}
        </select>
      </div>

      <div>
        <label htmlFor="filter-confidence">Confidence:</label>
        <select id="filter-confidence" value={confidence} onChange={handleConfidenceChange}>
          {CONFIDENCE_OPTIONS.map((opt) => (
            <option key={opt} value={opt}>
              {capitalize(opt)}
            </option>
          ))}
        </select>
      </div>

      <div>
        <label htmlFor="filter-show-external">Show external packages</label>
        <input
          id="filter-show-external"
          type="checkbox"
          checked={showExternal}
          onChange={handleShowExternalChange}
        />
      </div>

      <button type="button" onClick={handleReset}>
        Reset filters
      </button>
    </div>
  )
}
