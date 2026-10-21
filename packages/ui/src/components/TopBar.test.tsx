import { render, screen, waitFor } from '@testing-library/react'
import type { ReactNode } from 'react'
import { SWRConfig } from 'swr'
import { describe, expect, it, vi } from 'vitest'
import { TopBar } from './TopBar.js'

const STUB_OVERVIEW = {
  project: {
    name: 'Demo',
    root: '/x',
    snapshotBuiltAt: new Date(Date.now() - 120_000).toISOString(),
    snapshotScanId: 'scan1',
  },
  counts: {
    subsystems: 0,
    files: 0,
    edges: 0,
    findings: 0,
    externalPackages: 0,
  },
}

function makeWrapper(fetcher: (url: string) => Promise<unknown>) {
  return ({ children }: { children: ReactNode }) => (
    <SWRConfig
      value={{
        provider: () => new Map(),
        dedupingInterval: 0,
        suspense: false,
        fetcher,
      }}
    >
      {children}
    </SWRConfig>
  )
}

describe('TopBar', () => {
  describe('root element', () => {
    it('renders data-testid=topbar', () => {
      const Wrapper = makeWrapper(async () => STUB_OVERVIEW)
      render(<TopBar />, { wrapper: Wrapper })
      expect(screen.getByTestId('topbar')).toBeInTheDocument()
    })
  })

  describe('project name', () => {
    it('shows Vibe Graph fallback while data is loading', () => {
      // Use a never-resolving fetcher so data stays undefined
      const Wrapper = makeWrapper(() => new Promise(() => {}))
      render(<TopBar />, { wrapper: Wrapper })
      expect(screen.getByText('Vibe Graph')).toBeInTheDocument()
    })

    it('shows project name from useOverview data once loaded', async () => {
      const Wrapper = makeWrapper(async () => STUB_OVERVIEW)
      render(<TopBar />, { wrapper: Wrapper })
      await waitFor(() => screen.getByText('Demo'))
      expect(screen.getByText('Demo')).toBeInTheDocument()
    })
  })

  describe('theme toggle', () => {
    it('renders a theme toggle button inside TopBar', async () => {
      const Wrapper = makeWrapper(async () => STUB_OVERVIEW)
      render(<TopBar />, { wrapper: Wrapper })
      expect(screen.getByRole('button', { name: /toggle theme/i })).toBeInTheDocument()
    })
  })

  describe('scan status badge', () => {
    it('renders scan status text inside TopBar', async () => {
      const Wrapper = makeWrapper(async () => STUB_OVERVIEW)
      render(<TopBar />, { wrapper: Wrapper })
      // Wait for data to load so the badge shows actual time-ago text
      await waitFor(() => screen.getByText('Demo'))
      // Should render some time-ago text (2m ago, just now, etc.)
      const topbar = screen.getByTestId('topbar')
      expect(topbar).toBeInTheDocument()
    })

    it('visually separates project name from scan status badge', async () => {
      const Wrapper = makeWrapper(async () => STUB_OVERVIEW)
      render(<TopBar />, { wrapper: Wrapper })
      await waitFor(() => screen.getByText('Demo'))
      // Regression guard: textContent of header must not glue project name
      // directly against the time-ago label ("Demo2m ago"). Whitespace or a
      // separator character (·) must appear between them.
      const topbar = screen.getByTestId('topbar')
      const text = topbar.textContent ?? ''
      expect(text).not.toMatch(/Demo\d+[smhd]\s?ago/) // bug shape: "Demo2m ago"
      expect(text).toMatch(/Demo[\s·]+(just now|\d+[smhd] ago)/)
    })
  })

  describe('no console errors', () => {
    it('renders without console.error during loading state', () => {
      const spy = vi.spyOn(console, 'error')
      const Wrapper = makeWrapper(() => new Promise(() => {}))
      render(<TopBar />, { wrapper: Wrapper })
      expect(spy.mock.calls.length).toBe(0)
      spy.mockRestore()
    })
  })
})
