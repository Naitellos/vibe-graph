import type { Snapshot, Edge as VgEdge, Node as VgNode } from '@codearch/core'
import { render, screen, waitFor } from '@testing-library/react'
import type { ReactNode } from 'react'
import { SWRConfig } from 'swr'
import { beforeEach, describe, expect, it } from 'vitest'
import { useSelectionStore } from '../state/selection.js'
import type { NodeDetailResponse, OverviewResponse } from '../state/snapshot.js'
import { DetailView } from './DetailView.js'

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

function makeSnapshot(edges: VgEdge[] = []): Snapshot {
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

function makeNode(id: string): VgNode {
  return {
    id,
    kind: 'subsystem',
    title: id,
    layer: 'domain',
    status: 'unknown',
    tags: [],
    files: [],
    metadata: {},
  }
}

function makeEdge(id: string, from: string, to: string): VgEdge {
  return {
    id,
    from,
    to,
    kind: 'depends_on',
    category: 'structural',
    source: 'ast',
    confidence: 'high',
    evidenceIds: [],
    weight: 1,
    runtimeWeight: 0,
    typeOnlyWeight: 0,
    dynamicWeight: 0,
    metadata: {},
  }
}

function makeNodeDetail(nodeId: string): NodeDetailResponse {
  return {
    node: makeNode(nodeId),
    outgoing: [],
    incoming: [],
  }
}

type FetcherReturn = OverviewResponse | Snapshot | NodeDetailResponse

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
  useSelectionStore.getState().clear()
})

// ─── Tests ────────────────────────────────────────────────────────────────────

describe('DetailView', () => {
  it('renders ProjectOverviewCard when no selection', async () => {
    const Wrapper = makeWrapper((key) => {
      if (key === '/api/overview') return Promise.resolve(makeOverview())
      return Promise.resolve(makeSnapshot())
    })

    render(<DetailView />, { wrapper: Wrapper })

    await waitFor(() => {
      expect(screen.getByTestId('project-overview-card')).toBeInTheDocument()
    })
  })

  it('renders NodeDetailCard when a node is selected', async () => {
    useSelectionStore.setState({ selectedNodeId: 'node-abc' })

    const Wrapper = makeWrapper((key) => {
      if (key.startsWith('/api/node')) return Promise.resolve(makeNodeDetail('node-abc'))
      return Promise.resolve(makeSnapshot())
    })

    render(<DetailView />, { wrapper: Wrapper })

    await waitFor(() => {
      expect(screen.getByTestId('node-detail-card')).toBeInTheDocument()
    })
    expect(screen.queryByTestId('project-overview-card')).not.toBeInTheDocument()
  })

  it('renders EdgeDetailCard when an edge is selected (node cleared)', async () => {
    const edge = makeEdge('edge-1', 'subsystem:auth', 'subsystem:db')
    useSelectionStore.setState({ selectedNodeId: null, selectedEdgeId: 'edge-1' })

    const Wrapper = makeWrapper((key) => {
      if (key === '/api/overview') return Promise.resolve(makeOverview())
      return Promise.resolve(makeSnapshot([edge]))
    })

    render(<DetailView />, { wrapper: Wrapper })

    await waitFor(() => {
      expect(screen.getByTestId('edge-detail-card')).toBeInTheDocument()
    })
    expect(screen.queryByTestId('project-overview-card')).not.toBeInTheDocument()
    expect(screen.queryByTestId('node-detail-card')).not.toBeInTheDocument()
  })

  it('EdgeDetailCard takes priority over NodeDetailCard when both are set', async () => {
    const edge = makeEdge('edge-1', 'subsystem:auth', 'subsystem:db')
    useSelectionStore.setState({
      selectedNodeId: 'subsystem:auth',
      selectedEdgeId: 'edge-1',
    })

    const Wrapper = makeWrapper((key) => {
      if (key === '/api/overview') return Promise.resolve(makeOverview())
      return Promise.resolve(makeSnapshot([edge]))
    })

    render(<DetailView />, { wrapper: Wrapper })

    await waitFor(() => {
      expect(screen.getByTestId('edge-detail-card')).toBeInTheDocument()
    })
    expect(screen.queryByTestId('node-detail-card')).not.toBeInTheDocument()
  })
})
