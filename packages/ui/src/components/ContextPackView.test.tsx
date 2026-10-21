import type { ContextPack } from '@codearch/core'
import { render, screen, waitFor } from '@testing-library/react'
import { userEvent } from '@testing-library/user-event'
import type { ReactNode } from 'react'
import { SWRConfig } from 'swr'
import { beforeEach, describe, expect, it, vi } from 'vitest'
import { useSelectionStore } from '../state/selection.js'
import { ContextPackView } from './ContextPackView.js'

// ─── Fixtures ─────────────────────────────────────────────────────────────────

function makeContextPack(overrides?: Partial<ContextPack>): ContextPack {
  return {
    id: 'ctx-1',
    target: 'node-1',
    tokenBudget: 8000,
    estimatedTokens: 1234,
    tokenEstimateMethod: 'char-div-4',
    summary: 'Auth service context',
    facts: [],
    criticalFiles: [],
    relationships: [],
    blastRadius: [],
    recommendations: [],
    tests: [],
    doNotDo: [],
    metadata: { redactions: undefined },
    ...overrides,
  }
}

function makeWrapper(fetcherFn: (key: string) => Promise<unknown>) {
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
  useSelectionStore.getState().clear()
})

// ─── Tests ────────────────────────────────────────────────────────────────────

describe('ContextPackView', () => {
  describe('1. No-selection state', () => {
    it('shows instructive hint and disabled Generate button when no node selected', () => {
      const fetcher = vi.fn().mockResolvedValue(makeContextPack())
      const Wrapper = makeWrapper(fetcher)

      render(<ContextPackView />, { wrapper: Wrapper })

      expect(screen.getByTestId('context-pack-view')).toBeInTheDocument()
      expect(screen.getByText(/select a node to generate a context pack/i)).toBeInTheDocument()

      const generateBtn = screen.getByRole('button', { name: /generate context pack/i })
      expect(generateBtn).toBeDisabled()
    })
  })

  describe('2. Budget options render', () => {
    it('renders all 4 budget options: 4k, 8k, 12k, 16k', () => {
      const fetcher = vi.fn().mockResolvedValue(makeContextPack())
      const Wrapper = makeWrapper(fetcher)

      render(<ContextPackView />, { wrapper: Wrapper })

      expect(screen.getByRole('radio', { name: /4k/i })).toBeInTheDocument()
      expect(screen.getByRole('radio', { name: /8k/i })).toBeInTheDocument()
      expect(screen.getByRole('radio', { name: /12k/i })).toBeInTheDocument()
      expect(screen.getByRole('radio', { name: /16k/i })).toBeInTheDocument()
    })

    it('defaults to 8k budget selected', () => {
      const fetcher = vi.fn().mockResolvedValue(makeContextPack())
      const Wrapper = makeWrapper(fetcher)

      render(<ContextPackView />, { wrapper: Wrapper })

      expect(screen.getByRole('radio', { name: /8k/i })).toBeChecked()
    })
  })

  describe('3. Generate triggers SWR fetch', () => {
    it('clicking Generate calls the fetcher with the correct URL', async () => {
      const user = userEvent.setup()
      const fetcher = vi.fn().mockResolvedValue(makeContextPack())
      const Wrapper = makeWrapper(fetcher)

      useSelectionStore.getState().setSelectedNode('node-abc')

      render(<ContextPackView />, { wrapper: Wrapper })

      await user.click(screen.getByRole('button', { name: /generate context pack/i }))

      await waitFor(() => {
        expect(fetcher).toHaveBeenCalledWith(
          expect.stringContaining('/api/context-pack?target=node-abc'),
        )
        expect(fetcher).toHaveBeenCalledWith(expect.stringContaining('maxTokens=8000'))
      })
    })
  })

  describe('4. Changing budget after Generate refetches with new tokens', () => {
    it('a second Generate after changing budget uses the new budget value', async () => {
      const user = userEvent.setup()
      const fetcher = vi.fn().mockResolvedValue(makeContextPack())
      const Wrapper = makeWrapper(fetcher)

      useSelectionStore.getState().setSelectedNode('node-xyz')

      render(<ContextPackView />, { wrapper: Wrapper })

      // First generate with default 8k
      await user.click(screen.getByRole('button', { name: /generate context pack/i }))

      await waitFor(() => {
        expect(fetcher).toHaveBeenCalledWith(expect.stringContaining('maxTokens=8000'))
      })

      // Change budget to 4k
      await user.click(screen.getByRole('radio', { name: /4k/i }))

      // Generate again
      await user.click(screen.getByRole('button', { name: /generate context pack/i }))

      await waitFor(() => {
        expect(fetcher).toHaveBeenCalledWith(
          expect.stringContaining('/api/context-pack?target=node-xyz&maxTokens=4000'),
        )
      })
    })
  })

  describe('5. Preview JSON shown', () => {
    it('renders context-pack-preview pre element with JSON after Generate', async () => {
      const user = userEvent.setup()
      const pack = makeContextPack()
      const fetcher = vi.fn().mockResolvedValue(pack)
      const Wrapper = makeWrapper(fetcher)

      useSelectionStore.getState().setSelectedNode('node-1')

      render(<ContextPackView />, { wrapper: Wrapper })

      await user.click(screen.getByRole('button', { name: /generate context pack/i }))

      await waitFor(() => {
        const pre = screen.getByTestId('context-pack-preview')
        expect(pre).toBeInTheDocument()
        expect(pre.textContent).toContain('"estimatedTokens": 1234')
      })
    })
  })

  describe('6. Copy JSON', () => {
    it('clicking Copy JSON calls navigator.clipboard.writeText with the JSON', async () => {
      const user = userEvent.setup()
      const writeTextSpy = vi.spyOn(window.navigator.clipboard, 'writeText')

      const pack = makeContextPack()
      const fetcher = vi.fn().mockResolvedValue(pack)
      const Wrapper = makeWrapper(fetcher)

      useSelectionStore.getState().setSelectedNode('node-1')

      render(<ContextPackView />, { wrapper: Wrapper })

      await user.click(screen.getByRole('button', { name: /generate context pack/i }))

      await waitFor(() => {
        expect(screen.getByTestId('context-pack-preview')).toBeInTheDocument()
      })

      const copyBtn = screen.getByRole('button', { name: /copy json/i })
      await user.click(copyBtn)

      expect(writeTextSpy).toHaveBeenCalledWith(JSON.stringify(pack, null, 2))

      // Shows "Copied!" feedback
      await waitFor(() => {
        expect(screen.getByRole('button', { name: /copied!/i })).toBeInTheDocument()
      })
    })
  })

  describe('7. No spurious fetch on mount', () => {
    it('does not call fetcher before Generate is clicked', async () => {
      const fetcher = vi.fn().mockResolvedValue(makeContextPack())
      const Wrapper = makeWrapper(fetcher)

      useSelectionStore.getState().setSelectedNode('node-1')

      render(<ContextPackView />, { wrapper: Wrapper })

      // Wait a tick to give SWR a chance to fetch (if it were going to)
      await new Promise((r) => setTimeout(r, 50))

      expect(fetcher).not.toHaveBeenCalled()
    })
  })
})
