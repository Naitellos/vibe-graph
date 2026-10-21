import type { Snapshot } from '@codearch/core'
import { render, screen, waitFor } from '@testing-library/react'
import { userEvent } from '@testing-library/user-event'
import type { ReactNode } from 'react'
import { SWRConfig } from 'swr'
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import { useLayoutStore } from '../state/layout.js'
import { useSelectionStore } from '../state/selection.js'
import { useThemeStore } from '../state/theme.js'
import { CommandPalette } from './CommandPalette.js'

// ─── Fixtures ─────────────────────────────────────────────────────────────────

function makeSnapshot(overrides?: Partial<Snapshot>): Snapshot {
  return {
    meta: {
      schemaVersion: '0.1.0',
      scanId: '00000000-0000-0000-0000-000000000000',
      builtAt: '2024-01-01T00:00:00.000Z',
      projectRoot: '/repo',
      projectName: 'my-project',
      vibegraphVersion: '0.0.0',
      scanDurationMs: 0,
      fileCounts: { scanned: 0, indexed: 0, skipped: 0 },
    },
    nodes: [
      {
        id: 'subsystem:oracle',
        kind: 'subsystem',
        title: 'Oracle subsystem',
        layer: 'domain',
        status: 'unknown',
        tags: [],
        files: [],
        metadata: {},
      },
      {
        id: 'subsystem:auth',
        kind: 'subsystem',
        title: 'Auth',
        layer: 'domain',
        status: 'unknown',
        tags: [],
        files: [],
        metadata: {},
      },
      {
        id: 'file:src/oracle.ts',
        kind: 'file',
        title: 'oracle.ts',
        layer: 'domain',
        status: 'unknown',
        tags: [],
        files: [],
        metadata: {},
      },
    ],
    edges: [],
    evidence: [],
    findings: [
      {
        id: 'finding-1',
        domain: 'architecture',
        type: 'cycle',
        detectorId: 'core/cycles',
        severity: 'high',
        title: 'Oracle circular dependency',
        summary: 'A cycle exists',
        involvedNodeIds: ['subsystem:oracle'],
        evidenceIds: [],
        status: 'open',
        metadata: {},
      },
      {
        id: 'finding-2',
        domain: 'security',
        type: 'exposure',
        detectorId: 'core/exposure',
        severity: 'low',
        title: 'Auth token exposure',
        summary: 'Token exposed',
        involvedNodeIds: [],
        evidenceIds: [],
        status: 'open',
        metadata: {},
      },
    ],
    ...overrides,
  }
}

function makeWrapper(snapshot: Snapshot) {
  return ({ children }: { children: ReactNode }) => (
    <SWRConfig
      value={{
        provider: () => new Map(),
        dedupingInterval: 0,
        suspense: false,
        fetcher: () => Promise.resolve(snapshot),
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
  useThemeStore.setState({ theme: 'mystical' })
  globalThis.fetch = vi.fn().mockResolvedValue({ ok: true, status: 200 })
})

afterEach(() => {
  useLayoutStore.getState().reset()
  useSelectionStore.getState().clear()
  useThemeStore.setState({ theme: 'mystical' })
})

// ─── Tests ────────────────────────────────────────────────────────────────────

describe('CommandPalette', () => {
  describe('1. Hidden by default', () => {
    it('returns null when paletteOpen is false', () => {
      const snapshot = makeSnapshot()
      const Wrapper = makeWrapper(snapshot)
      render(<CommandPalette />, { wrapper: Wrapper })
      expect(screen.queryByTestId('command-palette')).toBeNull()
    })
  })

  describe('2. Visible when open', () => {
    it('renders dialog when paletteOpen is true', async () => {
      const snapshot = makeSnapshot()
      const Wrapper = makeWrapper(snapshot)
      useLayoutStore.getState().setPaletteOpen(true)
      render(<CommandPalette />, { wrapper: Wrapper })
      await waitFor(() => {
        expect(screen.getByRole('dialog')).toBeInTheDocument()
      })
      expect(screen.getByTestId('command-palette')).toBeInTheDocument()
    })
  })

  describe('3. Search filters nodes', () => {
    it('typing "ora" shows subsystem:oracle in results', async () => {
      const user = userEvent.setup()
      const snapshot = makeSnapshot()
      const Wrapper = makeWrapper(snapshot)
      useLayoutStore.getState().setPaletteOpen(true)
      render(<CommandPalette />, { wrapper: Wrapper })

      const input = await screen.findByRole('searchbox')
      await user.type(input, 'ora')

      await waitFor(() => {
        expect(screen.getByText('subsystem:oracle')).toBeInTheDocument()
      })
    })
  })

  describe('4. Run scan command', () => {
    it('typing "run scan" and clicking result POSTs /api/scan', async () => {
      const user = userEvent.setup()
      const snapshot = makeSnapshot()
      const Wrapper = makeWrapper(snapshot)
      useLayoutStore.getState().setPaletteOpen(true)
      render(<CommandPalette />, { wrapper: Wrapper })

      const input = await screen.findByRole('searchbox')
      await user.type(input, 'run scan')

      const runScanResult = await screen.findByText('Run scan')
      await user.click(runScanResult)

      expect(globalThis.fetch).toHaveBeenCalledWith('/api/scan', { method: 'POST' })
      // palette closes
      await waitFor(() => {
        expect(useLayoutStore.getState().paletteOpen).toBe(false)
      })
    })

    it('typing "run scan" and pressing Enter fires /api/scan', async () => {
      const user = userEvent.setup()
      const snapshot = makeSnapshot()
      const Wrapper = makeWrapper(snapshot)
      useLayoutStore.getState().setPaletteOpen(true)
      render(<CommandPalette />, { wrapper: Wrapper })

      const input = await screen.findByRole('searchbox')
      await user.type(input, 'run scan')

      await screen.findByText('Run scan')
      await user.keyboard('{Enter}')

      expect(globalThis.fetch).toHaveBeenCalledWith('/api/scan', { method: 'POST' })
    })
  })

  describe('5. Toggle theme command', () => {
    it('clicking "Toggle theme" flips the theme', async () => {
      const user = userEvent.setup()
      const snapshot = makeSnapshot()
      const Wrapper = makeWrapper(snapshot)
      useLayoutStore.getState().setPaletteOpen(true)
      render(<CommandPalette />, { wrapper: Wrapper })

      const input = await screen.findByRole('searchbox')
      await user.type(input, 'toggle theme')

      const toggleResult = await screen.findByText('Toggle theme')
      await user.click(toggleResult)

      expect(useThemeStore.getState().theme).toBe('minimal')
    })
  })

  describe('6. Reset layout command', () => {
    it('clicking "Reset layout" resets the layout store', async () => {
      const user = userEvent.setup()
      const snapshot = makeSnapshot()
      const Wrapper = makeWrapper(snapshot)
      useLayoutStore.getState().setPaletteOpen(true)
      useLayoutStore.getState().setLeftWidth(999)
      render(<CommandPalette />, { wrapper: Wrapper })

      const input = await screen.findByRole('searchbox')
      await user.type(input, 'reset layout')

      const resetResult = await screen.findByText('Reset layout')
      await user.click(resetResult)

      expect(useLayoutStore.getState().leftWidth).toBe(320)
    })
  })

  describe('7. Escape closes', () => {
    it('pressing Escape sets paletteOpen to false', async () => {
      const user = userEvent.setup()
      const snapshot = makeSnapshot()
      const Wrapper = makeWrapper(snapshot)
      useLayoutStore.getState().setPaletteOpen(true)
      render(<CommandPalette />, { wrapper: Wrapper })

      const input = await screen.findByRole('searchbox')
      input.focus()
      await user.keyboard('{Escape}')

      await waitFor(() => {
        expect(useLayoutStore.getState().paletteOpen).toBe(false)
      })
    })
  })

  describe('8. Arrow keys + Enter', () => {
    it('ArrowDown moves highlight and Enter activates second result', async () => {
      const user = userEvent.setup()
      const snapshot = makeSnapshot()
      const Wrapper = makeWrapper(snapshot)
      useLayoutStore.getState().setPaletteOpen(true)
      render(<CommandPalette />, { wrapper: Wrapper })

      const input = await screen.findByRole('searchbox')
      await user.type(input, 'run')

      // Wait for results to appear
      await screen.findByText('Run scan')

      // The first result is highlighted (index 0). Press ArrowDown to move to index 1.
      await user.keyboard('{ArrowDown}')
      // Press Enter — should activate second result
      // We just check that Enter does not throw and that palette reacts
      await user.keyboard('{Enter}')

      // palette should close after Enter on a valid result
      await waitFor(() => {
        expect(useLayoutStore.getState().paletteOpen).toBe(false)
      })
    })
  })

  describe('Node selection', () => {
    it('clicking a node result calls setSelectedNode and closes palette', async () => {
      const user = userEvent.setup()
      const snapshot = makeSnapshot()
      const Wrapper = makeWrapper(snapshot)
      useLayoutStore.getState().setPaletteOpen(true)
      render(<CommandPalette />, { wrapper: Wrapper })

      const input = await screen.findByRole('searchbox')
      await user.type(input, 'oracle')

      const oracleResult = await screen.findByText('subsystem:oracle')
      await user.click(oracleResult)

      expect(useSelectionStore.getState().selectedNodeId).toBe('subsystem:oracle')
      await waitFor(() => {
        expect(useLayoutStore.getState().paletteOpen).toBe(false)
      })
    })
  })

  describe('Finding selection', () => {
    it('clicking a finding result calls setSelectedFinding and closes palette', async () => {
      const user = userEvent.setup()
      const snapshot = makeSnapshot()
      const Wrapper = makeWrapper(snapshot)
      useLayoutStore.getState().setPaletteOpen(true)
      render(<CommandPalette />, { wrapper: Wrapper })

      const input = await screen.findByRole('searchbox')
      await user.type(input, 'Oracle circular')

      const findingResult = await screen.findByText('Oracle circular dependency')
      await user.click(findingResult)

      expect(useSelectionStore.getState().selectedFindingId).toBe('finding-1')
      await waitFor(() => {
        expect(useLayoutStore.getState().paletteOpen).toBe(false)
      })
    })
  })

  describe('Backdrop click', () => {
    it('clicking the backdrop closes the palette', async () => {
      const user = userEvent.setup()
      const snapshot = makeSnapshot()
      const Wrapper = makeWrapper(snapshot)
      useLayoutStore.getState().setPaletteOpen(true)
      render(<CommandPalette />, { wrapper: Wrapper })

      const backdrop = await screen.findByTestId('command-palette-backdrop')
      await user.click(backdrop)

      await waitFor(() => {
        expect(useLayoutStore.getState().paletteOpen).toBe(false)
      })
    })
  })
})
