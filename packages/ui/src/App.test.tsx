import type { Snapshot } from '@codearch/core'
import { render, screen, waitFor } from '@testing-library/react'
import type { ReactNode } from 'react'
import { SWRConfig } from 'swr'
import { beforeEach, describe, expect, it, vi } from 'vitest'
import { App } from './App.js'
import { useLayoutStore } from './state/layout.js'
import { useSelectionStore } from './state/selection.js'
import type { OverviewResponse } from './state/snapshot.js'

// ─── Minimal fixtures ─────────────────────────────────────────────────────────

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

type FetcherReturn = OverviewResponse | Snapshot | Record<string, never>

function stubFetcher(key: string): Promise<FetcherReturn> {
  if (key === '/api/overview') return Promise.resolve(makeOverview())
  if (key === '/api/snapshot') return Promise.resolve(makeSnapshot())
  // Fallback for blast-radius, node details, context-pack, findings, etc.
  return Promise.resolve({})
}

/**
 * Wraps the App with an outer SWRConfig that overrides the inner one rendered
 * by App itself. SWR merges from the closest ancestor, but since we set
 * fetcher/provider at the outer level, the inner App's swrConfig will inherit
 * our stub fetcher (it only sets `fetcher`, which we override here).
 */
function makeWrapper() {
  return ({ children }: { children: ReactNode }) => (
    <SWRConfig
      value={{
        provider: () => new Map(),
        dedupingInterval: 0,
        suspense: false,
        fetcher: stubFetcher,
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

describe('App integration', () => {
  describe('1. Renders TopBar', () => {
    it('renders the topbar element', () => {
      const Wrapper = makeWrapper()
      render(<App />, { wrapper: Wrapper })
      expect(screen.getByTestId('topbar')).toBeInTheDocument()
    })
  })

  describe('2. Renders CockpitShell with three slots', () => {
    it('renders graph-canvas in the center slot', () => {
      const Wrapper = makeWrapper()
      render(<App />, { wrapper: Wrapper })
      expect(screen.getByTestId('graph-canvas')).toBeInTheDocument()
    })

    it('renders filters-panel in the left slot when filters tab active', () => {
      useLayoutStore.getState().setLeftActiveTab('filters')
      const Wrapper = makeWrapper()
      render(<App />, { wrapper: Wrapper })
      expect(screen.getByTestId('filters-panel')).toBeInTheDocument()
    })

    it('renders project-overview-card in the right slot by default', async () => {
      const Wrapper = makeWrapper()
      render(<App />, { wrapper: Wrapper })
      await waitFor(() => {
        expect(screen.getByTestId('project-overview-card')).toBeInTheDocument()
      })
    })
  })

  describe('3. Renders ToastBar', () => {
    it('renders the toast-bar element', () => {
      const Wrapper = makeWrapper()
      render(<App />, { wrapper: Wrapper })
      expect(screen.getByTestId('toast-bar')).toBeInTheDocument()
    })
  })

  describe('4. No console errors during mount', () => {
    it('mounts without triggering console.error', () => {
      const spy = vi.spyOn(console, 'error')
      const Wrapper = makeWrapper()
      render(<App />, { wrapper: Wrapper })
      expect(spy.mock.calls.length).toBe(0)
      spy.mockRestore()
    })
  })

  describe('5. CommandPalette hidden initially', () => {
    it('does not render command-palette in the DOM by default', () => {
      const Wrapper = makeWrapper()
      render(<App />, { wrapper: Wrapper })
      expect(screen.queryByTestId('command-palette')).not.toBeInTheDocument()
    })
  })
})
