import type { Snapshot } from '@codearch/core'
import { render, screen, waitFor } from '@testing-library/react'
import { userEvent } from '@testing-library/user-event'
import type { ReactNode } from 'react'
import { SWRConfig } from 'swr'
import { beforeEach, describe, expect, it, vi } from 'vitest'
import { useLayoutStore } from '../state/layout.js'
import { LeftPanel } from './LeftPanel.js'

// ─── Minimal snapshot fixture ─────────────────────────────────────────────────

function makeSnapshot(): Snapshot {
  return {
    meta: {
      schemaVersion: '0.1.0',
      scanId: '00000000-0000-0000-0000-000000000000',
      builtAt: '2024-01-01T00:00:00.000Z',
      projectRoot: '/test',
      projectName: 'test',
      vibegraphVersion: '0.0.0',
      scanDurationMs: 0,
      fileCounts: { scanned: 0, indexed: 0, skipped: 0 },
    },
    nodes: [],
    edges: [],
    evidence: [],
    findings: [],
  }
}

function makeWrapper() {
  const snapshot = makeSnapshot()
  return ({ children }: { children: ReactNode }) => (
    <SWRConfig
      value={{
        provider: () => new Map(),
        dedupingInterval: 0,
        suspense: false,
        fetcher: async () => snapshot,
      }}
    >
      {children}
    </SWRConfig>
  )
}

beforeEach(() => {
  useLayoutStore.getState().reset()
})

describe('LeftPanel', () => {
  describe('default tab (findings)', () => {
    it('renders FindingsList (loading state) when leftActiveTab is "findings"', async () => {
      const Wrapper = makeWrapper()
      render(<LeftPanel />, { wrapper: Wrapper })
      // Either loading state or the empty list is present (both indicate FindingsList rendered)
      await waitFor(() => {
        const loadingOrEmpty =
          screen.queryByText(/loading findings/i) !== null ||
          screen.queryByText(/no findings yet/i) !== null ||
          // After data loads with empty findings, DomainTabs should be visible
          screen.queryByRole('button', { name: 'All' }) !== null
        expect(loadingOrEmpty).toBe(true)
      })
    })

    it('Findings tab button has data-active="true" by default', async () => {
      const Wrapper = makeWrapper()
      render(<LeftPanel />, { wrapper: Wrapper })
      const findingsBtn = screen.getByRole('button', { name: /findings/i })
      expect(findingsBtn).toHaveAttribute('data-active', 'true')
    })
  })

  describe('tab switching', () => {
    it('clicking Filters tab renders the filters placeholder', async () => {
      const user = userEvent.setup()
      const Wrapper = makeWrapper()
      render(<LeftPanel />, { wrapper: Wrapper })

      const filtersBtn = screen.getByRole('button', { name: /filters/i })
      await user.click(filtersBtn)

      expect(screen.getByTestId('filters-panel')).toBeInTheDocument()
    })

    it('after clicking Filters, Findings tab is no longer data-active="true"', async () => {
      const user = userEvent.setup()
      const Wrapper = makeWrapper()
      render(<LeftPanel />, { wrapper: Wrapper })

      await user.click(screen.getByRole('button', { name: /filters/i }))

      const findingsBtn = screen.getByRole('button', { name: /findings/i })
      expect(findingsBtn).not.toHaveAttribute('data-active', 'true')
    })

    it('Filters tab has data-active="true" after clicking it', async () => {
      const user = userEvent.setup()
      const Wrapper = makeWrapper()
      render(<LeftPanel />, { wrapper: Wrapper })

      const filtersBtn = screen.getByRole('button', { name: /filters/i })
      await user.click(filtersBtn)

      expect(filtersBtn).toHaveAttribute('data-active', 'true')
    })

    it('clicking Findings tab updates the layout store leftActiveTab', async () => {
      const user = userEvent.setup()
      // Start with filters tab active
      useLayoutStore.setState({ leftActiveTab: 'filters' })
      const Wrapper = makeWrapper()
      render(<LeftPanel />, { wrapper: Wrapper })

      await user.click(screen.getByRole('button', { name: /findings/i }))
      expect(useLayoutStore.getState().leftActiveTab).toBe('findings')
    })
  })

  describe('no console errors', () => {
    it('renders without console.error', () => {
      const spy = vi.spyOn(console, 'error')
      const Wrapper = makeWrapper()
      render(<LeftPanel />, { wrapper: Wrapper })
      expect(spy.mock.calls.length).toBe(0)
      spy.mockRestore()
    })
  })

  describe('layout structure', () => {
    it('renders panel body OUTSIDE the panel header (sibling container, not header child)', () => {
      const Wrapper = makeWrapper()
      const { container } = render(<LeftPanel />, { wrapper: Wrapper })
      const header = container.querySelector('.cockpit-panel-header')
      const body = container.querySelector('.cockpit-panel-body')
      expect(header).not.toBeNull()
      expect(body).not.toBeNull()
      // Regression guard: body must NOT be a descendant of header (current bug
      // crammed all findings + filter chips into the 2rem flex-row header).
      expect(header?.contains(body as Node)).toBe(false)
      // Body must contain the active tab content (findings or filters)
      const findingsListInBody =
        body?.querySelector('[data-testid="findings-list"]') ??
        body?.querySelector('[data-testid="filters-panel"]')
      // At least one of the panels must live inside the body
      const findingsAnywhere =
        container.querySelector('[data-testid="findings-list"]') ??
        container.querySelector('[data-testid="filters-panel"]')
      if (findingsAnywhere !== null) {
        expect(findingsListInBody).not.toBeNull()
      }
    })
  })
})
