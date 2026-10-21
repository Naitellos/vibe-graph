import { fireEvent, render } from '@testing-library/react'
import { describe, expect, it, vi } from 'vitest'
import { NodeRenderer } from './NodeRenderer.js'
import type { LayoutNode } from './graph-layout.js'

const sampleNode: LayoutNode = { id: 'subsystem:auth-service', x: 100, y: 200 }

// biome-ignore lint/a11y/noSvgWithoutTitle: test-only SVG wrapper
const Svg = ({ children }: { children: React.ReactNode }) => <svg>{children}</svg>

describe('NodeRenderer', () => {
  it('renders a <g> element with class vg-node', () => {
    const { container } = render(
      <Svg>
        <NodeRenderer
          node={sampleNode}
          meta={{ id: 'subsystem:auth-service', kind: 'subsystem', layer: 'domain' }}
        />
      </Svg>,
    )
    const g = container.querySelector('g.vg-node')
    expect(g).not.toBeNull()
  })

  it('contains exactly one <circle>', () => {
    const { container } = render(
      <Svg>
        <NodeRenderer
          node={sampleNode}
          meta={{ id: 'subsystem:auth-service', kind: 'subsystem', layer: 'domain' }}
        />
      </Svg>,
    )
    const circles = container.querySelectorAll('circle')
    expect(circles).toHaveLength(1)
  })

  it('contains exactly one <text>', () => {
    const { container } = render(
      <Svg>
        <NodeRenderer
          node={sampleNode}
          meta={{ id: 'subsystem:auth-service', kind: 'subsystem', layer: 'domain' }}
        />
      </Svg>,
    )
    const texts = container.querySelectorAll('text')
    expect(texts).toHaveLength(1)
  })

  it('circle has correct cx, cy attributes', () => {
    const { container } = render(
      <Svg>
        <NodeRenderer
          node={sampleNode}
          meta={{ id: 'subsystem:auth-service', kind: 'subsystem', layer: 'domain' }}
        />
      </Svg>,
    )
    const circle = container.querySelector('circle')
    expect(circle).toHaveAttribute('cx', '100')
    expect(circle).toHaveAttribute('cy', '200')
  })

  it('circle has data-node-id equal to node.id', () => {
    const { container } = render(
      <Svg>
        <NodeRenderer
          node={sampleNode}
          meta={{ id: 'subsystem:auth-service', kind: 'subsystem', layer: 'domain' }}
        />
      </Svg>,
    )
    const circle = container.querySelector('circle')
    expect(circle).toHaveAttribute('data-node-id', 'subsystem:auth-service')
  })

  it('label text is the suffix after the last colon', () => {
    const { container } = render(
      <Svg>
        <NodeRenderer
          node={sampleNode}
          meta={{ id: 'subsystem:auth-service', kind: 'subsystem', layer: 'domain' }}
        />
      </Svg>,
    )
    const text = container.querySelector('text')
    expect(text?.textContent).toBe('auth-service')
  })

  it('truncates very long labels to ~12 chars', () => {
    const longNode: LayoutNode = { id: 'subsystem:verylongnamethatexceedslimit', x: 0, y: 0 }
    const { container } = render(
      <Svg>
        <NodeRenderer
          node={longNode}
          meta={{ id: 'subsystem:verylongnamethatexceedslimit', kind: 'subsystem' }}
        />
      </Svg>,
    )
    const text = container.querySelector('text')
    expect(text?.textContent?.length).toBeLessThanOrEqual(12)
  })

  it('has data-layer attribute equal to the passed layer', () => {
    const { container } = render(
      <Svg>
        <NodeRenderer
          node={sampleNode}
          meta={{ id: 'subsystem:auth-service', kind: 'subsystem', layer: 'horizontal' }}
        />
      </Svg>,
    )
    const g = container.querySelector('g.vg-node')
    expect(g).toHaveAttribute('data-layer', 'horizontal')
  })

  it('data-layer defaults to "unknown" when layer is undefined', () => {
    const { container } = render(
      <Svg>
        <NodeRenderer
          node={sampleNode}
          meta={{ id: 'subsystem:auth-service', kind: 'subsystem' }}
        />
      </Svg>,
    )
    const g = container.querySelector('g.vg-node')
    expect(g).toHaveAttribute('data-layer', 'unknown')
  })

  it('renders without crashing when layer is undefined', () => {
    expect(() =>
      render(
        <Svg>
          <NodeRenderer node={sampleNode} meta={{ id: 'subsystem:auth-service' }} />
        </Svg>,
      ),
    ).not.toThrow()
  })

  it('text element has pointerEvents=none (Plan C §5.1: prevents text from intercepting clicks)', () => {
    const { container } = render(
      <Svg>
        <NodeRenderer
          node={sampleNode}
          meta={{ id: 'subsystem:auth-service', kind: 'subsystem', layer: 'domain' }}
        />
      </Svg>,
    )
    const textEl = container.querySelector('text')
    expect(textEl).toBeTruthy()
    // React converts pointerEvents prop to pointer-events SVG attribute
    expect(textEl?.getAttribute('pointer-events')).toBe('none')
  })

  it('clicking the circle fires onClick', () => {
    const onClick = vi.fn()
    const { container } = render(
      <Svg>
        <NodeRenderer
          node={sampleNode}
          meta={{ id: 'subsystem:auth-service', kind: 'subsystem', layer: 'domain' }}
          onClick={onClick}
        />
      </Svg>,
    )
    const circle = container.querySelector('circle')
    expect(circle).toBeTruthy()
    if (circle) {
      fireEvent.click(circle)
    }
    expect(onClick).toHaveBeenCalledWith('subsystem:auth-service')
  })

  it('node circle has bumped radius for readable labels (Plan C §5.4)', () => {
    const { container } = render(
      <Svg>
        <NodeRenderer
          node={sampleNode}
          meta={{ id: 'subsystem:auth-service', kind: 'subsystem', layer: 'domain' }}
        />
      </Svg>,
    )
    const circle = container.querySelector('circle')
    const r = Number(circle?.getAttribute('r'))
    expect(r).toBeGreaterThanOrEqual(42) // 1.5x previous baseline of 28
  })

  it('diffKind="added" → g[data-node-id] has data-diff-kind="added"', () => {
    const { container } = render(
      <Svg>
        <NodeRenderer
          node={sampleNode}
          meta={{ id: 'subsystem:auth-service', kind: 'subsystem', layer: 'domain' }}
          diffKind="added"
        />
      </Svg>,
    )
    const g = container.querySelector('g[data-node-id]')
    expect(g).toHaveAttribute('data-diff-kind', 'added')
  })

  it('blastBadge="+2" → a .vg-diff-badge text with content +2 renders', () => {
    const { container } = render(
      <Svg>
        <NodeRenderer
          node={sampleNode}
          meta={{ id: 'subsystem:auth-service', kind: 'subsystem', layer: 'domain' }}
          blastBadge="+2"
        />
      </Svg>,
    )
    const badge = container.querySelector('text.vg-diff-badge')
    expect(badge).not.toBeNull()
    expect(badge?.textContent).toBe('+2')
  })

  it('no diffKind/blastBadge → no data-diff-kind attr and no .vg-diff-badge', () => {
    const { container } = render(
      <Svg>
        <NodeRenderer
          node={sampleNode}
          meta={{ id: 'subsystem:auth-service', kind: 'subsystem', layer: 'domain' }}
        />
      </Svg>,
    )
    const g = container.querySelector('g[data-node-id]')
    expect(g?.hasAttribute('data-diff-kind')).toBe(false)
    const badge = container.querySelector('text.vg-diff-badge')
    expect(badge).toBeNull()
  })
})
