import type { Evidence, Snapshot, Edge as VgEdge } from '@codearch/core'
import { render, screen, waitFor } from '@testing-library/react'
import { userEvent } from '@testing-library/user-event'
import type { ReactNode } from 'react'
import { SWRConfig } from 'swr'
import { beforeEach, describe, expect, it } from 'vitest'
import { useSelectionStore } from '../state/selection.js'
import { EdgeDetailCard } from './EdgeDetailCard.js'

// ─── Fixtures ─────────────────────────────────────────────────────────────────

function makeEdge(overrides?: Partial<VgEdge>): VgEdge {
  return {
    id: 'edge-1',
    from: 'subsystem:auth',
    to: 'subsystem:db',
    kind: 'depends_on',
    category: 'structural',
    source: 'ast',
    confidence: 'high',
    evidenceIds: ['ev-1', 'ev-2'],
    weight: 1,
    runtimeWeight: 0,
    typeOnlyWeight: 0,
    dynamicWeight: 0,
    metadata: {},
    ...overrides,
  }
}

function makeEvidence(id: string, file: string, line?: number): Evidence {
  return {
    id,
    sourceKind: 'ast',
    file,
    line,
    detail: 'import statement',
    confidence: 'high',
    coupling: 'runtime',
  }
}

function makeSnapshot(edges: VgEdge[], evidence: Evidence[]): Snapshot {
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
    edges,
    evidence,
    findings: [],
  }
}

function makeWrapper(snapshot: Snapshot) {
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

function loadingWrapper({ children }: { children: ReactNode }) {
  return (
    <SWRConfig
      value={{
        provider: () => new Map(),
        dedupingInterval: 0,
        suspense: false,
        fetcher: () => new Promise(() => {}),
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

describe('EdgeDetailCard', () => {
  describe('loading state', () => {
    it('renders loading indicator while snapshot is pending', () => {
      useSelectionStore.setState({ selectedEdgeId: 'edge-1' })
      render(<EdgeDetailCard />, { wrapper: loadingWrapper })
      expect(screen.getByTestId('edge-detail-loading')).toBeInTheDocument()
    })
  })

  describe('renders edge header', () => {
    it('renders "from → to" header', async () => {
      const edge = makeEdge()
      useSelectionStore.setState({ selectedEdgeId: 'edge-1' })

      const Wrapper = makeWrapper(makeSnapshot([edge], []))
      render(<EdgeDetailCard />, { wrapper: Wrapper })

      await waitFor(() => {
        expect(screen.getByTestId('edge-detail-card')).toBeInTheDocument()
        expect(screen.getByText(/subsystem:auth/)).toBeInTheDocument()
        expect(screen.getByText(/subsystem:db/)).toBeInTheDocument()
      })
    })

    it('has data-testid="edge-detail-card" on root element', async () => {
      const edge = makeEdge()
      useSelectionStore.setState({ selectedEdgeId: 'edge-1' })

      const Wrapper = makeWrapper(makeSnapshot([edge], []))
      render(<EdgeDetailCard />, { wrapper: Wrapper })

      await waitFor(() => {
        expect(screen.getByTestId('edge-detail-card')).toBeInTheDocument()
      })
    })
  })

  describe('evidence list', () => {
    it('renders evidence items as file:line', async () => {
      const edge = makeEdge({ evidenceIds: ['ev-1', 'ev-2'] })
      const evidence = [
        makeEvidence('ev-1', '/src/auth/service.ts', 10),
        makeEvidence('ev-2', '/src/auth/types.ts', 25),
      ]
      useSelectionStore.setState({ selectedEdgeId: 'edge-1' })

      const Wrapper = makeWrapper(makeSnapshot([edge], evidence))
      render(<EdgeDetailCard />, { wrapper: Wrapper })

      await waitFor(() => {
        expect(screen.getByText('/src/auth/service.ts:10')).toBeInTheDocument()
        expect(screen.getByText('/src/auth/types.ts:25')).toBeInTheDocument()
      })
    })

    it('renders evidence item with just file if no line number', async () => {
      const edge = makeEdge({ evidenceIds: ['ev-1'] })
      const evidence = [makeEvidence('ev-1', '/src/config.ts')]
      useSelectionStore.setState({ selectedEdgeId: 'edge-1' })

      const Wrapper = makeWrapper(makeSnapshot([edge], evidence))
      render(<EdgeDetailCard />, { wrapper: Wrapper })

      await waitFor(() => {
        expect(screen.getByText('/src/config.ts')).toBeInTheDocument()
      })
    })
  })

  describe('click interactions', () => {
    it('clicking from node calls setSelectedNode with fromId', async () => {
      const user = userEvent.setup()
      const edge = makeEdge()
      useSelectionStore.setState({ selectedEdgeId: 'edge-1' })

      const Wrapper = makeWrapper(makeSnapshot([edge], []))
      render(<EdgeDetailCard />, { wrapper: Wrapper })

      await waitFor(() => screen.getByTestId('edge-detail-card'))
      const fromBtn = screen.getByRole('button', { name: 'subsystem:auth' })
      await user.click(fromBtn)

      expect(useSelectionStore.getState().selectedNodeId).toBe('subsystem:auth')
    })

    it('clicking to node calls setSelectedNode with toId', async () => {
      const user = userEvent.setup()
      const edge = makeEdge()
      useSelectionStore.setState({ selectedEdgeId: 'edge-1' })

      const Wrapper = makeWrapper(makeSnapshot([edge], []))
      render(<EdgeDetailCard />, { wrapper: Wrapper })

      await waitFor(() => screen.getByTestId('edge-detail-card'))
      const toBtn = screen.getByRole('button', { name: 'subsystem:db' })
      await user.click(toBtn)

      expect(useSelectionStore.getState().selectedNodeId).toBe('subsystem:db')
    })
  })
})
