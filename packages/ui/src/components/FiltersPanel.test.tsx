import { fireEvent, render, screen } from '@testing-library/react'
import { afterEach, describe, expect, it } from 'vitest'
import { useFiltersStore } from '../state/filters.js'
import { FiltersPanel } from './FiltersPanel.js'

afterEach(() => {
  useFiltersStore.getState().reset()
})

describe('FiltersPanel', () => {
  describe('rendering', () => {
    it('has data-testid="filters-panel"', () => {
      render(<FiltersPanel />)
      expect(screen.getByTestId('filters-panel')).toBeInTheDocument()
    })

    it('renders 4 select elements', () => {
      render(<FiltersPanel />)
      expect(screen.getAllByRole('combobox')).toHaveLength(4)
    })

    it('renders Layer select with label', () => {
      render(<FiltersPanel />)
      expect(screen.getByLabelText('Layer:')).toBeInTheDocument()
    })

    it('renders Edge Kind select with label', () => {
      render(<FiltersPanel />)
      expect(screen.getByLabelText('Edge Kind:')).toBeInTheDocument()
    })

    it('renders Coupling select with label', () => {
      render(<FiltersPanel />)
      expect(screen.getByLabelText('Coupling:')).toBeInTheDocument()
    })

    it('renders Confidence select with label', () => {
      render(<FiltersPanel />)
      expect(screen.getByLabelText('Confidence:')).toBeInTheDocument()
    })

    it('renders Show external packages checkbox', () => {
      render(<FiltersPanel />)
      expect(screen.getByLabelText('Show external packages')).toBeInTheDocument()
    })

    it('renders a Reset filters button', () => {
      render(<FiltersPanel />)
      expect(screen.getByRole('button', { name: /reset filters/i })).toBeInTheDocument()
    })
  })

  describe('Layer select options', () => {
    it('has All option', () => {
      render(<FiltersPanel />)
      const select = screen.getByLabelText('Layer:') as HTMLSelectElement
      expect(select.querySelector('option[value="all"]')).toBeTruthy()
    })
    it('has domain option', () => {
      render(<FiltersPanel />)
      const select = screen.getByLabelText('Layer:') as HTMLSelectElement
      expect(select.querySelector('option[value="domain"]')).toBeTruthy()
    })
    it('has horizontal option', () => {
      render(<FiltersPanel />)
      const select = screen.getByLabelText('Layer:') as HTMLSelectElement
      expect(select.querySelector('option[value="horizontal"]')).toBeTruthy()
    })
    it('has infra option', () => {
      render(<FiltersPanel />)
      const select = screen.getByLabelText('Layer:') as HTMLSelectElement
      expect(select.querySelector('option[value="infra"]')).toBeTruthy()
    })
    it('has external option', () => {
      render(<FiltersPanel />)
      const select = screen.getByLabelText('Layer:') as HTMLSelectElement
      expect(select.querySelector('option[value="external"]')).toBeTruthy()
    })
    it('has unknown option', () => {
      render(<FiltersPanel />)
      const select = screen.getByLabelText('Layer:') as HTMLSelectElement
      expect(select.querySelector('option[value="unknown"]')).toBeTruthy()
    })
  })

  describe('EdgeKind select options', () => {
    it('has All option', () => {
      render(<FiltersPanel />)
      const select = screen.getByLabelText('Edge Kind:') as HTMLSelectElement
      expect(select.querySelector('option[value="all"]')).toBeTruthy()
    })
    it('has imports option', () => {
      render(<FiltersPanel />)
      const select = screen.getByLabelText('Edge Kind:') as HTMLSelectElement
      expect(select.querySelector('option[value="imports"]')).toBeTruthy()
    })
    it('has depends_on option', () => {
      render(<FiltersPanel />)
      const select = screen.getByLabelText('Edge Kind:') as HTMLSelectElement
      expect(select.querySelector('option[value="depends_on"]')).toBeTruthy()
    })
    it('has contains option', () => {
      render(<FiltersPanel />)
      const select = screen.getByLabelText('Edge Kind:') as HTMLSelectElement
      expect(select.querySelector('option[value="contains"]')).toBeTruthy()
    })
  })

  describe('interactions', () => {
    it('changing layer select updates store', () => {
      render(<FiltersPanel />)
      const select = screen.getByLabelText('Layer:')
      fireEvent.change(select, { target: { value: 'domain' } })
      expect(useFiltersStore.getState().layer).toBe('domain')
    })

    it('changing edgeKind select updates store', () => {
      render(<FiltersPanel />)
      const select = screen.getByLabelText('Edge Kind:')
      fireEvent.change(select, { target: { value: 'imports' } })
      expect(useFiltersStore.getState().edgeKind).toBe('imports')
    })

    it('changing coupling select updates store', () => {
      render(<FiltersPanel />)
      const select = screen.getByLabelText('Coupling:')
      fireEvent.change(select, { target: { value: 'runtime' } })
      expect(useFiltersStore.getState().coupling).toBe('runtime')
    })

    it('changing confidence select updates store', () => {
      render(<FiltersPanel />)
      const select = screen.getByLabelText('Confidence:')
      fireEvent.change(select, { target: { value: 'high' } })
      expect(useFiltersStore.getState().confidence).toBe('high')
    })

    it('toggling showExternal checkbox flips the store value', () => {
      render(<FiltersPanel />)
      const checkbox = screen.getByLabelText('Show external packages')
      expect(useFiltersStore.getState().showExternal).toBe(false)
      fireEvent.click(checkbox)
      expect(useFiltersStore.getState().showExternal).toBe(true)
      fireEvent.click(checkbox)
      expect(useFiltersStore.getState().showExternal).toBe(false)
    })

    it('clicking Reset filters restores defaults', () => {
      render(<FiltersPanel />)
      fireEvent.change(screen.getByLabelText('Layer:'), { target: { value: 'infra' } })
      fireEvent.change(screen.getByLabelText('Confidence:'), { target: { value: 'low' } })
      fireEvent.click(screen.getByRole('button', { name: /reset filters/i }))
      const state = useFiltersStore.getState()
      expect(state.layer).toBe('all')
      expect(state.confidence).toBe('all')
      expect(state.showExternal).toBe(false)
    })

    it('can select two non-default layer values (smoke)', () => {
      render(<FiltersPanel />)
      const select = screen.getByLabelText('Layer:')
      fireEvent.change(select, { target: { value: 'external' } })
      expect(useFiltersStore.getState().layer).toBe('external')
      fireEvent.change(select, { target: { value: 'horizontal' } })
      expect(useFiltersStore.getState().layer).toBe('horizontal')
    })
  })
})
