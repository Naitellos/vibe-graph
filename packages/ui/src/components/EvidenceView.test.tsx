import type { Snapshot, Edge as VgEdge } from '@codearch/core'
import { render, screen, waitFor } from '@testing-library/react'
import type { ReactNode } from 'react'
import { SWRConfig } from 'swr'
import { beforeEach, describe, expect, it } from 'vitest'
import { useSelectionStore } from '../state/selection.js'
import { EvidenceView } from './EvidenceView.js'

// ─── Fixtures ─────────────────────────────────────────────────────────────────

function makeEdge(id: string, from: string, to: string, evidenceIds: string[]): VgEdge {
  return {
    id,
    from,
    to,
    kind: 'depends_on',
    category: 'structural',
    source: 'ast',
    confidence: 'high',
    evidenceIds,
    weight: 1,
    runtimeWeight: 0,
    typeOnlyWeight: 0,
    dynamicWeight: 0,
    metadata: {},
  }
}

function makeSnapshot(edges: VgEdge[]): Snapshot {
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
    evidence: [],
    findings: [],
  }
}

// A per-test fetcher map: key pattern → response
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

describe('EvidenceView', () => {
  describe('no selection', () => {
    it('renders evidence-view root', async () => {
      const Wrapper = makeWrapper(() => Promise.resolve(makeSnapshot([])))
      render(<EvidenceView />, { wrapper: Wrapper })

      await waitFor(() => {
        expect(screen.getByTestId('evidence-view')).toBeInTheDocument()
      })
    })

    it('renders "No evidence" message when nothing is selected', async () => {
      const Wrapper = makeWrapper(() => Promise.resolve(makeSnapshot([])))
      render(<EvidenceView />, { wrapper: Wrapper })

      await waitFor(() => {
        expect(screen.getByText(/no evidence for this selection/i)).toBeInTheDocument()
      })
    })
  })

  describe('edge selection', () => {
    it('renders 2 EvidenceItems when edge has 2 evidenceIds', async () => {
      useSelectionStore.setState({ selectedEdgeId: 'edge-1' })

      const edges = [makeEdge('edge-1', 'subsystem:auth', 'subsystem:db', ['ev-1', 'ev-2'])]
      const snapshot = makeSnapshot(edges)

      const Wrapper = makeWrapper((key) => {
        if (key === '/api/snapshot') return Promise.resolve(snapshot)
        // Evidence lazy-load — return pending so items show in loading state
        return new Promise(() => {})
      })

      render(<EvidenceView />, { wrapper: Wrapper })

      await waitFor(() => {
        const items = screen.getAllByTestId('evidence-item-loading')
        expect(items).toHaveLength(2)
      })
    })

    it('renders header with correct count', async () => {
      useSelectionStore.setState({ selectedEdgeId: 'edge-1' })

      const edges = [makeEdge('edge-1', 'subsystem:auth', 'subsystem:db', ['ev-1', 'ev-2'])]
      const snapshot = makeSnapshot(edges)

      const Wrapper = makeWrapper((key) => {
        if (key === '/api/snapshot') return Promise.resolve(snapshot)
        return new Promise(() => {})
      })

      render(<EvidenceView />, { wrapper: Wrapper })

      await waitFor(() => {
        expect(screen.getByText(/evidence.*2 item/i)).toBeInTheDocument()
      })
    })

    it('renders "No evidence" when edge has no evidenceIds', async () => {
      useSelectionStore.setState({ selectedEdgeId: 'edge-1' })

      const edges = [makeEdge('edge-1', 'subsystem:auth', 'subsystem:db', [])]
      const snapshot = makeSnapshot(edges)

      const Wrapper = makeWrapper((key) => {
        if (key === '/api/snapshot') return Promise.resolve(snapshot)
        return new Promise(() => {})
      })

      render(<EvidenceView />, { wrapper: Wrapper })

      await waitFor(() => {
        expect(screen.getByText(/no evidence for this selection/i)).toBeInTheDocument()
      })
    })
  })

  describe('node selection', () => {
    it('collects evidenceIds from all incident edges and deduplicates', async () => {
      useSelectionStore.setState({ selectedNodeId: 'subsystem:auth' })

      const edges = [
        // outgoing edge with ev-1, ev-2
        makeEdge('edge-1', 'subsystem:auth', 'subsystem:db', ['ev-1', 'ev-2']),
        // incoming edge with ev-2 (duplicate) and ev-3
        makeEdge('edge-2', 'subsystem:gateway', 'subsystem:auth', ['ev-2', 'ev-3']),
        // unrelated edge
        makeEdge('edge-3', 'subsystem:cache', 'subsystem:db', ['ev-99']),
      ]
      const snapshot = makeSnapshot(edges)

      const Wrapper = makeWrapper((key) => {
        if (key === '/api/snapshot') return Promise.resolve(snapshot)
        return new Promise(() => {})
      })

      render(<EvidenceView />, { wrapper: Wrapper })

      // Deduplicated: ev-1, ev-2, ev-3 (3 items, ev-2 appears in both edges)
      await waitFor(() => {
        const items = screen.getAllByTestId('evidence-item-loading')
        expect(items).toHaveLength(3)
      })
    })

    it('renders "No evidence" when node has no incident edges', async () => {
      useSelectionStore.setState({ selectedNodeId: 'subsystem:isolated' })

      const snapshot = makeSnapshot([])

      const Wrapper = makeWrapper((key) => {
        if (key === '/api/snapshot') return Promise.resolve(snapshot)
        return new Promise(() => {})
      })

      render(<EvidenceView />, { wrapper: Wrapper })

      await waitFor(() => {
        expect(screen.getByText(/no evidence for this selection/i)).toBeInTheDocument()
      })
    })
  })
})
