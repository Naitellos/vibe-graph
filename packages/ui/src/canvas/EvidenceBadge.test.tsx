import { render } from '@testing-library/react'
import { describe, expect, it } from 'vitest'
import { EvidenceBadge } from './EvidenceBadge.js'

// biome-ignore lint/a11y/noSvgWithoutTitle: test wrapper SVGs — title not required in unit tests
const TestSvg = ({ children }: { children: React.ReactNode }) => <svg>{children}</svg>

describe('EvidenceBadge', () => {
  it('renders a text element for each item', () => {
    const items = [
      { file: 'a.ts', line: 1 },
      { file: 'b.ts', line: 2 },
      { file: 'c.ts', line: 3 },
    ]
    const { container } = render(
      <TestSvg>
        <EvidenceBadge x={100} y={100} items={items} />
      </TestSvg>,
    )
    const texts = container.querySelectorAll('text')
    expect(texts).toHaveLength(3)
  })

  it('truncates to the number of items passed (caller responsibility)', () => {
    // Caller passes 3 items; badge renders exactly 3 text elements
    const items = [
      { file: 'x.ts', line: 10 },
      { file: 'y.ts', line: 20 },
      { file: 'z.ts', line: 30 },
    ]
    const { container } = render(
      <TestSvg>
        <EvidenceBadge x={0} y={0} items={items} />
      </TestSvg>,
    )
    expect(container.querySelectorAll('text')).toHaveLength(3)
  })

  it('renders file:line format when line is present', () => {
    const items = [{ file: 'src/index.ts', line: 42 }]
    const { container } = render(
      <TestSvg>
        <EvidenceBadge x={0} y={0} items={items} />
      </TestSvg>,
    )
    const text = container.querySelector('text')
    expect(text?.textContent).toBe('src/index.ts:42')
  })

  it('renders only file when line is undefined', () => {
    const items = [{ file: 'src/utils.ts' }]
    const { container } = render(
      <TestSvg>
        <EvidenceBadge x={0} y={0} items={items} />
      </TestSvg>,
    )
    const text = container.querySelector('text')
    expect(text?.textContent).toBe('src/utils.ts')
  })

  it('renders a rect background element', () => {
    const items = [{ file: 'a.ts', line: 1 }]
    const { container } = render(
      <TestSvg>
        <EvidenceBadge x={50} y={50} items={items} />
      </TestSvg>,
    )
    const rect = container.querySelector('rect')
    expect(rect).not.toBeNull()
  })

  it('has pointer-events:none on the root <g> so it does not interfere with edge mouse events', () => {
    const items = [{ file: 'a.ts', line: 1 }]
    const { container } = render(
      <TestSvg>
        <EvidenceBadge x={0} y={0} items={items} />
      </TestSvg>,
    )
    const g = container.querySelector('g.evidence-badge')
    expect(g).not.toBeNull()
    expect((g as HTMLElement | null)?.style.pointerEvents).toBe('none')
  })
})
