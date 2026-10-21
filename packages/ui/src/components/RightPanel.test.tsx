import type { Snapshot } from '@codearch/core'
import { render, screen, waitFor } from '@testing-library/react'
import { userEvent } from '@testing-library/user-event'
import type { ReactNode } from 'react'
import { SWRConfig } from 'swr'
import { beforeEach, describe, expect, it } from 'vitest'
import { useLayoutStore } from '../state/layout.js'
import { useSelectionStore } from '../state/selection.js'
import type { OverviewResponse } from '../state/snapshot.js'
import { RightPanel } from './RightPanel.js'

// ─── Fixtures ─────────────────────────────────────────────────────────────────

function makeOverview(): OverviewResponse {
  return {
    project: {
      name: 'test-project',
      root: '/repo',
      snapshotBuiltAt: '2024-01-01T00:00:00.000Z',
      snapshotScanId: '00000000-0000-0000-0000-000000000001',
    },
    counts: {
      subsystems: 0,
      files: 0,
      edges: 0,
      findings: 0,
      externalPackages: 0,
    },
  }
}

function makeSnapshot(): Snapshot {
  return {
    meta: {
      schemaVersion: '0.1.0',
      scanId: '00000000-0000-0000-0000-000000000000',
      builtAt: '2024-01-01T00:00:00.000Z',
      projectRoot: '/repo',
      projectName: 'test-project',
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

type FetcherReturn = OverviewResponse | Snapshot

function makeWrapper(fetcherFn: (key: string) => Promise<FetcherReturn>) {
  return ({ children }: { children: ReactNode }) => (
    <SWRConfig
      value={{
        provider: () => new Map(),
        dedupingInterval: 0,
        suspense: false,
        fetcher: fetcherFn,
      }}
    >
      {children}
    </SWRConfig>
  )
}

// ─── Setup ────────────────────────────────────────────────────────────────────

beforeEach(() => {
  useLayoutStore.getState().reset()
  useSelectionStore.getState().clear()
})

// ─── Tests ────────────────────────────────────────────────────────────────────

describe('RightPanel', () => {
  const defaultWrapper = () =>
    makeWrapper((key) => {
      if (key === '/api/overview') return Promise.resolve(makeOverview())
      return Promise.resolve(makeSnapshot())
    })

  describe('default tab (detail)', () => {
    it('renders ProjectOverviewCard (via DetailView) when no selection', async () => {
      const Wrapper = defaultWrapper()
      render(<RightPanel />, { wrapper: Wrapper })

      await waitFor(() => {
        expect(screen.getByTestId('project-overview-card')).toBeInTheDocument()
      })
    })

    it('"Detail" tab has data-active="true" by default', () => {
      const Wrapper = defaultWrapper()
      render(<RightPanel />, { wrapper: Wrapper })

      const detailTab = screen.getByRole('tab', { name: /detail/i })
      expect(detailTab).toHaveAttribute('data-active', 'true')
    })
  })

  describe('tab switching', () => {
    it('clicking "Evidence" tab renders evidence-view', async () => {
      const user = userEvent.setup()
      const Wrapper = defaultWrapper()
      render(<RightPanel />, { wrapper: Wrapper })

      await user.click(screen.getByRole('tab', { name: /evidence/i }))

      await waitFor(() => {
        expect(screen.getByTestId('evidence-view')).toBeInTheDocument()
      })
    })

    it('clicking "Context Pack" tab renders context-pack-view', async () => {
      const user = userEvent.setup()
      const Wrapper = defaultWrapper()
      render(<RightPanel />, { wrapper: Wrapper })

      await user.click(screen.getByRole('tab', { name: /context pack/i }))

      expect(screen.getByTestId('context-pack-view')).toBeInTheDocument()
    })

    it('active tab has data-active="true"', async () => {
      const user = userEvent.setup()
      const Wrapper = defaultWrapper()
      render(<RightPanel />, { wrapper: Wrapper })

      const evidenceTab = screen.getByRole('tab', { name: /evidence/i })
      await user.click(evidenceTab)

      expect(evidenceTab).toHaveAttribute('data-active', 'true')
      expect(screen.getByRole('tab', { name: /detail/i })).not.toHaveAttribute(
        'data-active',
        'true',
      )
    })
  })

  describe('layout structure', () => {
    it('renders panel body OUTSIDE the panel header (separate sibling)', async () => {
      const Wrapper = defaultWrapper()
      const { container } = render(<RightPanel />, { wrapper: Wrapper })
      await waitFor(() => screen.getByTestId('project-overview-card'))

      const header = container.querySelector('.cockpit-panel-header')
      const body = container.querySelector('.cockpit-panel-body')
      const detailCard = container.querySelector('[data-testid="project-overview-card"]')

      expect(header).not.toBeNull()
      expect(body).not.toBeNull()
      expect(detailCard).not.toBeNull()

      // Regression guard: DetailView content must NOT live inside the flex-row
      // header (current bug rendered DetailView as sibling of the tab buttons
      // inside the header, causing tabs and content to share the row layout).
      expect(header?.contains(detailCard as Node)).toBe(false)
      expect(body?.contains(detailCard as Node)).toBe(true)
    })
  })
})
