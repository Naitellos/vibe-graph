import { render, screen } from '@testing-library/react'
import { describe, expect, it } from 'vitest'
import { SubsystemDocView } from './SubsystemDocView.js'

const minimalDoc = {
  id: 'payments',
  title: 'Payments',
  layer: 'domain',
  status: 'shipped',
  description: '',
  match: ['src/**'],
  declaredDependsOn: [],
  declaredConsumedBy: [],
  schemaTables: [],
  relatedSpecs: [],
  relatedDecisions: [],
  memoryRefs: [],
}

describe('SubsystemDocView', () => {
  it('renders title and layer/status pills', () => {
    render(<SubsystemDocView doc={minimalDoc} />)
    expect(screen.getByRole('heading', { name: 'Payments', level: 2 })).toBeTruthy()
    expect(screen.getByText('domain')).toBeTruthy()
    expect(screen.getByText('shipped')).toBeTruthy()
  })

  it('renders lastVerified pill when present', () => {
    render(
      <SubsystemDocView
        doc={{ ...minimalDoc, lastVerified: new Date().toISOString().slice(0, 10) }}
      />,
    )
    expect(screen.getByText(/verified/)).toBeTruthy()
  })

  it('omits lastVerified pill when absent', () => {
    render(<SubsystemDocView doc={minimalDoc} />)
    expect(screen.queryByText(/verified/)).toBeNull()
  })

  it('renders description as markdown when non-empty', () => {
    render(
      <SubsystemDocView doc={{ ...minimalDoc, description: '# Header\n\nThis is **bold**.' }} />,
    )
    expect(screen.getByRole('heading', { name: 'Header', level: 1 })).toBeTruthy()
  })

  it('omits description section when empty', () => {
    render(<SubsystemDocView doc={minimalDoc} />)
    expect(screen.queryByRole('heading', { name: 'Description' })).toBeNull()
  })

  it('renders declaredDependsOn chips', () => {
    render(<SubsystemDocView doc={{ ...minimalDoc, declaredDependsOn: ['auth', 'oracle'] }} />)
    expect(screen.getByText('auth')).toBeTruthy()
    expect(screen.getByText('oracle')).toBeTruthy()
  })

  it('renders schemaTables ("Owns") chips', () => {
    render(
      <SubsystemDocView
        doc={{
          ...minimalDoc,
          schemaTables: ['payment_transactions', 'subscription_plans'],
        }}
      />,
    )
    expect(screen.getByText('payment_transactions')).toBeTruthy()
    expect(screen.getByText('subscription_plans')).toBeTruthy()
  })

  it('renders relatedSpecs as linkouts', () => {
    render(<SubsystemDocView doc={{ ...minimalDoc, relatedSpecs: ['docs/specs/2026-05-16.md'] }} />)
    const link = screen.getByRole('link', { name: /2026-05-16/ })
    expect(link.getAttribute('href')).toContain('docs/specs/2026-05-16.md')
  })

  it('renders memoryRefs chips', () => {
    render(<SubsystemDocView doc={{ ...minimalDoc, memoryRefs: ['monetization-details'] }} />)
    expect(screen.getByText('monetization-details')).toBeTruthy()
  })

  // ─── UX2/UX3: CSS class structure (pill/chip targets) ────────────────────────

  it('UX2 — pills container has className "pills"', () => {
    const { container } = render(<SubsystemDocView doc={minimalDoc} />)
    const pillsEl = container.querySelector('.pills')
    expect(pillsEl).toBeTruthy()
  })

  it('UX2 — each pill span has className containing "pill"', () => {
    const { container } = render(<SubsystemDocView doc={minimalDoc} />)
    const pills = container.querySelectorAll('.pill')
    // At minimum: layer pill + status pill
    expect(pills.length).toBeGreaterThanOrEqual(2)
  })

  it('UX2 — layer pill has class "pill layer-<value>"', () => {
    const { container } = render(<SubsystemDocView doc={minimalDoc} />)
    // minimalDoc.layer = 'domain'
    expect(container.querySelector('.pill.layer-domain')).toBeTruthy()
  })

  it('UX2 — status pill has class "pill status-<value>"', () => {
    const { container } = render(<SubsystemDocView doc={minimalDoc} />)
    // minimalDoc.status = 'shipped'
    expect(container.querySelector('.pill.status-shipped')).toBeTruthy()
  })

  it('UX3 — chip list items have className "chip" (declaredDependsOn)', () => {
    const { container } = render(
      <SubsystemDocView doc={{ ...minimalDoc, declaredDependsOn: ['auth', 'oracle'] }} />,
    )
    const chips = container.querySelectorAll('.chip')
    expect(chips.length).toBeGreaterThanOrEqual(2)
  })

  it('UX3 — chip list container has className "chips"', () => {
    const { container } = render(
      <SubsystemDocView doc={{ ...minimalDoc, schemaTables: ['payments_tx'] }} />,
    )
    expect(container.querySelector('.chips')).toBeTruthy()
  })
})
