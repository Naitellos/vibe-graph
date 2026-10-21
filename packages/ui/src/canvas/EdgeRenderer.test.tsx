import { render } from '@testing-library/react'
import { describe, expect, it } from 'vitest'
import { EdgeRenderer, pathFromPoints } from './EdgeRenderer.js'
import type { LayoutEdge } from './graph-layout.js'

const sampleEdge: LayoutEdge = {
  id: 'edge-ab',
  points: [
    { x: 10, y: 20 },
    { x: 50, y: 60 },
    { x: 90, y: 40 },
  ],
}

describe('pathFromPoints', () => {
  it('produces M x0 y0 L x1 y1 ... string', () => {
    const d = pathFromPoints([
      { x: 10, y: 20 },
      { x: 50, y: 60 },
    ])
    expect(d).toBe('M 10 20 L 50 60')
  })

  it('handles a single-point gracefully (M only)', () => {
    const d = pathFromPoints([{ x: 5, y: 5 }])
    expect(d).toBe('M 5 5')
  })

  it('handles three points correctly', () => {
    const d = pathFromPoints([
      { x: 10, y: 20 },
      { x: 50, y: 60 },
      { x: 90, y: 40 },
    ])
    expect(d).toBe('M 10 20 L 50 60 L 90 40')
  })
})

describe('EdgeRenderer', () => {
  it('renders a <path> element', () => {
    const { container } = render(<EdgeRenderer edge={sampleEdge} />)
    const path = container.querySelector('path')
    expect(path).not.toBeNull()
  })

  it('has class vg-edge', () => {
    const { container } = render(<EdgeRenderer edge={sampleEdge} />)
    const path = container.querySelector('path')
    expect(path).toHaveClass('vg-edge')
  })

  it('has correct data-edge-id attribute', () => {
    const { container } = render(<EdgeRenderer edge={sampleEdge} />)
    const path = container.querySelector('path')
    expect(path).toHaveAttribute('data-edge-id', 'edge-ab')
  })

  it('has d attribute matching pathFromPoints output', () => {
    const { container } = render(<EdgeRenderer edge={sampleEdge} />)
    const path = container.querySelector('path')
    const expected = pathFromPoints(sampleEdge.points)
    expect(path).toHaveAttribute('d', expected)
  })

  it('diffKind="removed" → path[data-edge-id] has data-diff-kind="removed"', () => {
    const { container } = render(<EdgeRenderer edge={sampleEdge} diffKind="removed" />)
    const path = container.querySelector('path[data-edge-id]')
    expect(path).toHaveAttribute('data-diff-kind', 'removed')
  })
})
