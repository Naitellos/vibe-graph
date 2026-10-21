import { render } from '@testing-library/react'
import { describe, expect, it } from 'vitest'
import { MapLegend } from './MapLegend.js'

// biome-ignore lint/a11y/noSvgWithoutTitle: test wrapper SVGs — title not required in unit tests
const TestSvg = ({ children }: { children: React.ReactNode }) => <svg>{children}</svg>

describe('MapLegend', () => {
  it('renders a <g> with class "map-legend"', () => {
    const { container } = render(
      <TestSvg>
        <MapLegend />
      </TestSvg>,
    )
    const g = container.querySelector('g.map-legend')
    expect(g).not.toBeNull()
  })

  it('renders a background <rect>', () => {
    const { container } = render(
      <TestSvg>
        <MapLegend />
      </TestSvg>,
    )
    const rect = container.querySelector('g.map-legend rect.bg')
    expect(rect).not.toBeNull()
  })

  it('renders a title text "Legend"', () => {
    const { container } = render(
      <TestSvg>
        <MapLegend />
      </TestSvg>,
    )
    const title = container.querySelector('g.map-legend text.title')
    expect(title).not.toBeNull()
    expect(title?.textContent).toBe('Legend')
  })

  it('renders the "Severity" section title', () => {
    const { container } = render(
      <TestSvg>
        <MapLegend />
      </TestSvg>,
    )
    const texts = Array.from(container.querySelectorAll('g.map-legend text'))
    const severityTitle = texts.find((t) => t.textContent === 'Severity')
    expect(severityTitle).not.toBeUndefined()
  })

  it('renders at least 3 severity rows (High, Medium, Low)', () => {
    const { container } = render(
      <TestSvg>
        <MapLegend />
      </TestSvg>,
    )
    const texts = Array.from(container.querySelectorAll('g.map-legend text'))
    const labels = texts.map((t) => t.textContent)
    expect(labels).toContain('High')
    expect(labels).toContain('Medium')
    expect(labels).toContain('Low')
  })

  it('severity rows have named swatch classes', () => {
    const { container } = render(
      <TestSvg>
        <MapLegend />
      </TestSvg>,
    )
    expect(container.querySelector('.swatch-severity-high')).not.toBeNull()
    expect(container.querySelector('.swatch-severity-medium')).not.toBeNull()
    expect(container.querySelector('.swatch-severity-low')).not.toBeNull()
  })

  it('renders the "Coupling" section title', () => {
    const { container } = render(
      <TestSvg>
        <MapLegend />
      </TestSvg>,
    )
    const texts = Array.from(container.querySelectorAll('g.map-legend text'))
    const couplingTitle = texts.find((t) => t.textContent === 'Coupling')
    expect(couplingTitle).not.toBeUndefined()
  })

  it('renders at least 4 coupling rows (Runtime, Type-only, Dynamic, Re-export)', () => {
    const { container } = render(
      <TestSvg>
        <MapLegend />
      </TestSvg>,
    )
    const texts = Array.from(container.querySelectorAll('g.map-legend text'))
    const labels = texts.map((t) => t.textContent)
    expect(labels).toContain('Runtime')
    expect(labels).toContain('Type-only')
    expect(labels).toContain('Dynamic')
    expect(labels).toContain('Re-export')
  })

  it('coupling rows have named swatch classes', () => {
    const { container } = render(
      <TestSvg>
        <MapLegend />
      </TestSvg>,
    )
    expect(container.querySelector('.swatch-coupling-runtime')).not.toBeNull()
    expect(container.querySelector('.swatch-coupling-type-only')).not.toBeNull()
    expect(container.querySelector('.swatch-coupling-dynamic')).not.toBeNull()
    expect(container.querySelector('.swatch-coupling-reexport')).not.toBeNull()
  })

  it('root <g> has pointer-events: none style', () => {
    const { container } = render(
      <TestSvg>
        <MapLegend />
      </TestSvg>,
    )
    const g = container.querySelector('g.map-legend') as HTMLElement | null
    expect(g).not.toBeNull()
    expect(g?.style.pointerEvents).toBe('none')
  })

  it('root <g> has a translate transform at top-left position', () => {
    const { container } = render(
      <TestSvg>
        <MapLegend />
      </TestSvg>,
    )
    const g = container.querySelector('g.map-legend')
    expect(g).not.toBeNull()
    const transform = g?.getAttribute('transform')
    expect(transform).toMatch(/translate\(16,\s*16\)/)
  })
})
