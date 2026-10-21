import type { Finding, Snapshot, Edge as VgEdge, Node as VgNode } from '@codearch/core'
import { render, screen, waitFor } from '@testing-library/react'
import { userEvent } from '@testing-library/user-event'
import type { ReactNode } from 'react'
import { SWRConfig } from 'swr'
import { type MockInstance, afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import { useSelectionStore } from '../state/selection.js'
import type { NodeDetailResponse, OverviewResponse } from '../state/snapshot.js'
import { NodeDetailCard } from './NodeDetailCard.js'

// ─── Fixtures ─────────────────────────────────────────────────────────────────

function makeNode(overrides?: Partial<VgNode>): VgNode {
  return {
    id: 'subsystem:auth',
    kind: 'subsystem',
    title: 'Auth',
    layer: 'domain',
    status: 'shipped',
    tags: [],
    files: ['/src/auth/index.ts', '/src/auth/service.ts'],
    metadata: {},
    ...overrides,
  }
}

function makeEdge(id: string, from: string, to: string, overrides?: Partial<VgEdge>): VgEdge {
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
    ...overrides,
  }
}

function makeFinding(id: string, involvedNodeIds: string[]): Finding {
  return {
    id,
    domain: 'architecture',
    type: 'cycle',
    detectorId: 'core/cycles',
    severity: 'high',
    title: `Finding ${id}`,
    summary: 'A cycle exists',
    involvedNodeIds,
    evidenceIds: [],
    status: 'open',
    metadata: {},
  }
}

function makeSnapshot(findings: Finding[]): Snapshot {
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
    findings,
  }
}

function makeNodeDetail(node: VgNode, outgoing: VgEdge[], incoming: VgEdge[]): NodeDetailResponse {
  return { node, outgoing, incoming }
}

type FetcherReturn = NodeDetailResponse | Snapshot | OverviewResponse | null

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

describe('NodeDetailCard', () => {
  describe('loading state', () => {
    it('renders loading indicator while SWR is pending', () => {
      useSelectionStore.setState({ selectedNodeId: 'subsystem:auth' })
      render(<NodeDetailCard />, { wrapper: loadingWrapper })
      expect(screen.getByTestId('node-detail-loading')).toBeInTheDocument()
    })
  })

  describe('renders node header', () => {
    it('renders heading with node.title (not raw id) for subsystem nodes', async () => {
      const node = makeNode()
      useSelectionStore.setState({ selectedNodeId: 'subsystem:auth' })

      const Wrapper = makeWrapper((key) => {
        if (key.startsWith('/api/node')) return Promise.resolve(makeNodeDetail(node, [], []))
        if (key.startsWith('/api/subsystem-docs/')) return Promise.resolve(null)
        return Promise.resolve(makeSnapshot([]))
      })

      render(<NodeDetailCard />, { wrapper: Wrapper })

      await waitFor(() => {
        // node.title = 'Auth' from makeNode fixture; heading must show title not raw id
        const headings = screen.getAllByRole('heading').filter((h) => h.tagName === 'H2')
        expect(headings[0]).toHaveTextContent('Auth')
        expect(headings[0]).not.toHaveTextContent('subsystem:auth')
      })
    })

    it('has data-testid="node-detail-card" on root element', async () => {
      const node = makeNode()
      useSelectionStore.setState({ selectedNodeId: 'subsystem:auth' })

      const Wrapper = makeWrapper((key) => {
        if (key.startsWith('/api/node')) return Promise.resolve(makeNodeDetail(node, [], []))
        return Promise.resolve(makeSnapshot([]))
      })

      render(<NodeDetailCard />, { wrapper: Wrapper })

      await waitFor(() => {
        expect(screen.getByTestId('node-detail-card')).toBeInTheDocument()
      })
    })
  })

  describe('depends-on list (outgoing edges)', () => {
    it('renders each outgoing edge to value', async () => {
      const node = makeNode()
      const outgoing = [
        makeEdge('e1', 'subsystem:auth', 'subsystem:db'),
        makeEdge('e2', 'subsystem:auth', 'subsystem:cache'),
      ]
      useSelectionStore.setState({ selectedNodeId: 'subsystem:auth' })

      const Wrapper = makeWrapper((key) => {
        if (key.startsWith('/api/node')) return Promise.resolve(makeNodeDetail(node, outgoing, []))
        return Promise.resolve(makeSnapshot([]))
      })

      render(<NodeDetailCard />, { wrapper: Wrapper })

      await waitFor(() => {
        expect(screen.getByText('subsystem:db')).toBeInTheDocument()
        expect(screen.getByText('subsystem:cache')).toBeInTheDocument()
      })
    })

    it('clicking a depends-on item calls setSelectedNode with that id', async () => {
      const user = userEvent.setup()
      const node = makeNode()
      const outgoing = [makeEdge('e1', 'subsystem:auth', 'subsystem:db')]
      useSelectionStore.setState({ selectedNodeId: 'subsystem:auth' })

      const Wrapper = makeWrapper((key) => {
        if (key.startsWith('/api/node')) return Promise.resolve(makeNodeDetail(node, outgoing, []))
        return Promise.resolve(makeSnapshot([]))
      })

      render(<NodeDetailCard />, { wrapper: Wrapper })

      await waitFor(() => screen.getByText('subsystem:db'))
      await user.click(screen.getByText('subsystem:db'))

      expect(useSelectionStore.getState().selectedNodeId).toBe('subsystem:db')
    })
  })

  describe('consumed-by list (incoming edges)', () => {
    it('renders each incoming edge from value', async () => {
      const node = makeNode()
      const incoming = [
        makeEdge('e3', 'subsystem:gateway', 'subsystem:auth'),
        makeEdge('e4', 'subsystem:api', 'subsystem:auth'),
      ]
      useSelectionStore.setState({ selectedNodeId: 'subsystem:auth' })

      const Wrapper = makeWrapper((key) => {
        if (key.startsWith('/api/node')) return Promise.resolve(makeNodeDetail(node, [], incoming))
        return Promise.resolve(makeSnapshot([]))
      })

      render(<NodeDetailCard />, { wrapper: Wrapper })

      await waitFor(() => {
        expect(screen.getByText('subsystem:gateway')).toBeInTheDocument()
        expect(screen.getByText('subsystem:api')).toBeInTheDocument()
      })
    })

    it('clicking a consumed-by item calls setSelectedNode with that id', async () => {
      const user = userEvent.setup()
      const node = makeNode()
      const incoming = [makeEdge('e3', 'subsystem:gateway', 'subsystem:auth')]
      useSelectionStore.setState({ selectedNodeId: 'subsystem:auth' })

      const Wrapper = makeWrapper((key) => {
        if (key.startsWith('/api/node')) return Promise.resolve(makeNodeDetail(node, [], incoming))
        return Promise.resolve(makeSnapshot([]))
      })

      render(<NodeDetailCard />, { wrapper: Wrapper })

      await waitFor(() => screen.getByText('subsystem:gateway'))
      await user.click(screen.getByText('subsystem:gateway'))

      expect(useSelectionStore.getState().selectedNodeId).toBe('subsystem:gateway')
    })
  })

  describe('findings', () => {
    it('renders findings filtered by involvedNodeIds', async () => {
      const node = makeNode({ id: 'subsystem:auth' })
      const findings = [
        makeFinding('f1', ['subsystem:auth', 'subsystem:db']),
        makeFinding('f2', ['subsystem:cache']),
      ]
      useSelectionStore.setState({ selectedNodeId: 'subsystem:auth' })

      const Wrapper = makeWrapper((key) => {
        if (key.startsWith('/api/node')) return Promise.resolve(makeNodeDetail(node, [], []))
        return Promise.resolve(makeSnapshot(findings))
      })

      render(<NodeDetailCard />, { wrapper: Wrapper })

      await waitFor(() => {
        expect(screen.getByText('Finding f1')).toBeInTheDocument()
        expect(screen.queryByText('Finding f2')).not.toBeInTheDocument()
      })
    })

    it('clicking a finding calls setSelectedFinding with finding id', async () => {
      const user = userEvent.setup()
      const node = makeNode({ id: 'subsystem:auth' })
      const findings = [makeFinding('f1', ['subsystem:auth'])]
      useSelectionStore.setState({ selectedNodeId: 'subsystem:auth' })

      const Wrapper = makeWrapper((key) => {
        if (key.startsWith('/api/node')) return Promise.resolve(makeNodeDetail(node, [], []))
        return Promise.resolve(makeSnapshot(findings))
      })

      render(<NodeDetailCard />, { wrapper: Wrapper })

      await waitFor(() => screen.getByText('Finding f1'))
      await user.click(screen.getByText('Finding f1'))

      expect(useSelectionStore.getState().selectedFindingId).toBe('f1')
    })
  })

  describe('files section', () => {
    it('renders files list for subsystem nodes', async () => {
      const node = makeNode({
        kind: 'subsystem',
        files: ['/src/auth/index.ts', '/src/auth/service.ts'],
      })
      useSelectionStore.setState({ selectedNodeId: 'subsystem:auth' })

      const Wrapper = makeWrapper((key) => {
        if (key.startsWith('/api/node')) return Promise.resolve(makeNodeDetail(node, [], []))
        if (key.startsWith('/api/subsystem-docs/')) return Promise.resolve(null)
        return Promise.resolve(makeSnapshot([]))
      })

      render(<NodeDetailCard />, { wrapper: Wrapper })

      await waitFor(() => {
        expect(screen.getByText('/src/auth/index.ts')).toBeInTheDocument()
        expect(screen.getByText('/src/auth/service.ts')).toBeInTheDocument()
      })
    })

    it('does not render files section for non-subsystem nodes', async () => {
      const node = makeNode({ kind: 'file', files: ['/src/auth/index.ts'] })
      useSelectionStore.setState({ selectedNodeId: 'subsystem:auth' })

      const Wrapper = makeWrapper((key) => {
        if (key.startsWith('/api/node')) return Promise.resolve(makeNodeDetail(node, [], []))
        return Promise.resolve(makeSnapshot([]))
      })

      render(<NodeDetailCard />, { wrapper: Wrapper })

      await waitFor(() => {
        expect(screen.getByTestId('node-detail-card')).toBeInTheDocument()
      })
      expect(screen.queryByText('/src/auth/index.ts')).not.toBeInTheDocument()
    })
  })

  // ─── Plan C §5.2 + §5.3 ──────────────────────────────────────────────────────

  describe('Plan C §5.2 — heading uses node.title not raw id', () => {
    let fetchSpy: MockInstance<typeof fetch>

    afterEach(() => {
      fetchSpy.mockRestore()
    })

    it('heading shows node.title (not raw id) for subsystem nodes', async () => {
      // Mock fetch so useSubsystemDoc returns null (no doc loaded yet — legacy path)
      fetchSpy = vi.spyOn(globalThis, 'fetch').mockImplementation((url) => {
        const urlStr = String(url)
        if (urlStr.includes('/api/subsystem-docs/')) {
          return Promise.resolve(new Response('', { status: 404 }))
        }
        return Promise.reject(new Error(`Unexpected fetch: ${urlStr}`))
      })

      const node = makeNode({ id: 'subsystem:payments', title: 'Payments' })
      useSelectionStore.setState({ selectedNodeId: 'subsystem:payments' })

      const Wrapper = makeWrapper((key) => {
        if (key.startsWith('/api/node')) return Promise.resolve(makeNodeDetail(node, [], []))
        return Promise.resolve(makeSnapshot([]))
      })

      render(<NodeDetailCard />, { wrapper: Wrapper })

      await waitFor(() => {
        // The main h2 heading must show node.title, not the raw subsystem: id
        const headings = screen.getAllByRole('heading').filter((h) => h.tagName === 'H2')
        expect(headings[0]).toHaveTextContent('Payments')
        expect(headings[0]).not.toHaveTextContent('subsystem:payments')
      })
    })
  })

  describe('Plan C §5.2 — SubsystemDocView shown when doc exists', () => {
    let fetchSpy: MockInstance<typeof fetch>

    afterEach(() => {
      fetchSpy.mockRestore()
    })

    it('renders SubsystemDocView (.subsystem-doc) when a doc is fetched for this node', async () => {
      const stubDoc = {
        id: 'auth',
        title: 'Auth',
        layer: 'domain',
        status: 'shipped',
        description: 'Auth system',
        match: [],
        declaredDependsOn: [],
        declaredConsumedBy: [],
        schemaTables: [],
        relatedSpecs: [],
        relatedDecisions: [],
        memoryRefs: [],
      }
      fetchSpy = vi.spyOn(globalThis, 'fetch').mockImplementation((url) => {
        const urlStr = String(url)
        if (urlStr.includes('/api/subsystem-docs/auth')) {
          return Promise.resolve(new Response(JSON.stringify(stubDoc), { status: 200 }))
        }
        return Promise.reject(new Error(`Unexpected fetch: ${urlStr}`))
      })

      const node = makeNode({ id: 'subsystem:auth', title: 'Auth' })
      useSelectionStore.setState({ selectedNodeId: 'subsystem:auth' })

      const Wrapper = makeWrapper((key) => {
        if (key.startsWith('/api/node')) return Promise.resolve(makeNodeDetail(node, [], []))
        return Promise.resolve(makeSnapshot([]))
      })

      render(<NodeDetailCard />, { wrapper: Wrapper })

      await waitFor(() => {
        expect(document.querySelector('.subsystem-doc')).toBeTruthy()
      })
    })
  })

  // ─── UX4/UX6: rich-doc suppresses duplicate legacy sections ────────────────

  describe('UX4/UX6 — rich doc suppresses duplicate h2/dl/depends_on/consumed_by sections', () => {
    let fetchSpy: MockInstance<typeof fetch>

    afterEach(() => {
      fetchSpy.mockRestore()
    })

    it('UX4a — with rich doc, only ONE h2 heading rendered (SubsystemDocView owns it)', async () => {
      const stubDoc = {
        id: 'auth',
        title: 'Auth',
        layer: 'domain',
        status: 'shipped',
        description: '',
        match: [],
        declaredDependsOn: [],
        declaredConsumedBy: [],
        schemaTables: [],
        relatedSpecs: [],
        relatedDecisions: [],
        memoryRefs: [],
      }
      fetchSpy = vi.spyOn(globalThis, 'fetch').mockImplementation((url) => {
        const urlStr = String(url)
        if (urlStr.includes('/api/subsystem-docs/auth')) {
          return Promise.resolve(new Response(JSON.stringify(stubDoc), { status: 200 }))
        }
        return Promise.reject(new Error(`Unexpected fetch: ${urlStr}`))
      })

      const node = makeNode({ id: 'subsystem:auth', title: 'Auth' })
      useSelectionStore.setState({ selectedNodeId: 'subsystem:auth' })

      const Wrapper = makeWrapper((key) => {
        if (key.startsWith('/api/node')) return Promise.resolve(makeNodeDetail(node, [], []))
        return Promise.resolve(makeSnapshot([]))
      })

      render(<NodeDetailCard />, { wrapper: Wrapper })

      await waitFor(() => {
        expect(document.querySelector('.subsystem-doc')).toBeTruthy()
      })

      // Exactly ONE h2 heading — the NodeDetailCard legacy h2 must be suppressed
      const h2s = screen.getAllByRole('heading', { level: 2 })
      expect(h2s).toHaveLength(1)
      expect(h2s[0]).toHaveTextContent('Auth')
    })

    it('UX4b — with rich doc, legacy "Depends on" and "Consumed by" sections are NOT rendered', async () => {
      const stubDoc = {
        id: 'auth',
        title: 'Auth',
        layer: 'domain',
        status: 'shipped',
        description: '',
        match: [],
        declaredDependsOn: ['subsystem:core'],
        declaredConsumedBy: ['subsystem:gateway'],
        schemaTables: [],
        relatedSpecs: [],
        relatedDecisions: [],
        memoryRefs: [],
      }
      fetchSpy = vi.spyOn(globalThis, 'fetch').mockImplementation((url) => {
        const urlStr = String(url)
        if (urlStr.includes('/api/subsystem-docs/auth')) {
          return Promise.resolve(new Response(JSON.stringify(stubDoc), { status: 200 }))
        }
        return Promise.reject(new Error(`Unexpected fetch: ${urlStr}`))
      })

      const node = makeNode({ id: 'subsystem:auth', title: 'Auth', files: [] })
      const outgoing = [makeEdge('e1', 'subsystem:auth', 'subsystem:core')]
      const incoming = [makeEdge('e2', 'subsystem:gateway', 'subsystem:auth')]
      useSelectionStore.setState({ selectedNodeId: 'subsystem:auth' })

      const Wrapper = makeWrapper((key) => {
        if (key.startsWith('/api/node'))
          return Promise.resolve(makeNodeDetail(node, outgoing, incoming))
        return Promise.resolve(makeSnapshot([]))
      })

      render(<NodeDetailCard />, { wrapper: Wrapper })

      await waitFor(() => {
        expect(document.querySelector('.subsystem-doc')).toBeTruthy()
      })

      // SubsystemDocView is rendered (from doc's declared deps/consumers)
      expect(document.querySelector('.subsystem-doc')).toBeTruthy()

      // The legacy h4-headed sections "Depends on" and "Consumed by" must be gone
      // (SubsystemDocView's chip sections own those under a h3, not h4)
      const h4s = Array.from(document.querySelectorAll('h4'))
      const legacyDependsOn = h4s.find((h) => /depends on/i.test(h.textContent ?? ''))
      const legacyConsumedBy = h4s.find((h) => /consumed by/i.test(h.textContent ?? ''))
      expect(legacyDependsOn).toBeUndefined()
      expect(legacyConsumedBy).toBeUndefined()
    })

    it('UX4c — without rich doc, legacy "Depends on", "Consumed by", and <dl> ARE rendered', async () => {
      fetchSpy = vi.spyOn(globalThis, 'fetch').mockImplementation((url) => {
        const urlStr = String(url)
        if (urlStr.includes('/api/subsystem-docs/')) {
          return Promise.resolve(new Response('', { status: 404 }))
        }
        return Promise.reject(new Error(`Unexpected fetch: ${urlStr}`))
      })

      const node = makeNode({ id: 'subsystem:auth', title: 'Auth', files: [] })
      const outgoing = [makeEdge('e1', 'subsystem:auth', 'subsystem:core')]
      const incoming = [makeEdge('e2', 'subsystem:gateway', 'subsystem:auth')]
      useSelectionStore.setState({ selectedNodeId: 'subsystem:auth' })

      const Wrapper = makeWrapper((key) => {
        if (key.startsWith('/api/node'))
          return Promise.resolve(makeNodeDetail(node, outgoing, incoming))
        return Promise.resolve(makeSnapshot([]))
      })

      render(<NodeDetailCard />, { wrapper: Wrapper })

      await waitFor(() => {
        // Legacy h2 must be present
        const h2 = screen.getByRole('heading', { level: 2 })
        expect(h2).toHaveTextContent('Auth')
      })

      // Legacy <dl> present
      expect(document.querySelector('dl')).toBeTruthy()

      // Legacy "Depends on" and "Consumed by" h4 sections present
      const h4s = Array.from(document.querySelectorAll('h4'))
      expect(h4s.some((h) => /depends on/i.test(h.textContent ?? ''))).toBe(true)
      expect(h4s.some((h) => /consumed by/i.test(h.textContent ?? ''))).toBe(true)
    })

    it('UX6 — legacy edge lists show titles not raw ids when snapshot.nodes provides title', async () => {
      fetchSpy = vi.spyOn(globalThis, 'fetch').mockImplementation((url) => {
        const urlStr = String(url)
        if (urlStr.includes('/api/subsystem-docs/')) {
          return Promise.resolve(new Response('', { status: 404 }))
        }
        return Promise.reject(new Error(`Unexpected fetch: ${urlStr}`))
      })

      const node = makeNode({ id: 'subsystem:auth', title: 'Auth', files: [] })
      const coreNode: VgNode = {
        id: 'subsystem:core',
        kind: 'subsystem',
        title: 'core',
        layer: 'domain',
        status: 'shipped',
        tags: [],
        files: [],
        metadata: {},
      }
      const gatewayNode: VgNode = {
        id: 'subsystem:gateway',
        kind: 'subsystem',
        title: 'gateway',
        layer: 'domain',
        status: 'shipped',
        tags: [],
        files: [],
        metadata: {},
      }
      const outgoing = [makeEdge('e1', 'subsystem:auth', 'subsystem:core')]
      const incoming = [makeEdge('e2', 'subsystem:gateway', 'subsystem:auth')]
      useSelectionStore.setState({ selectedNodeId: 'subsystem:auth' })

      const snapshotWithNodes: Snapshot = {
        ...makeSnapshot([]),
        nodes: [node, coreNode, gatewayNode],
      }

      const Wrapper = makeWrapper((key) => {
        if (key.startsWith('/api/node'))
          return Promise.resolve(makeNodeDetail(node, outgoing, incoming))
        return Promise.resolve(snapshotWithNodes)
      })

      render(<NodeDetailCard />, { wrapper: Wrapper })

      await waitFor(() => {
        // Titles used in legacy lists — not raw ids
        expect(screen.getByText('core')).toBeInTheDocument()
        expect(screen.getByText('gateway')).toBeInTheDocument()
      })

      // Raw ids NOT present as button text
      expect(screen.queryByText('subsystem:core')).not.toBeInTheDocument()
      expect(screen.queryByText('subsystem:gateway')).not.toBeInTheDocument()
    })
  })

  describe('Plan C §5.3 — contains vs depends_on in separate sections', () => {
    let fetchSpy: MockInstance<typeof fetch>

    afterEach(() => {
      fetchSpy.mockRestore()
    })

    it('contains-files (kind=contains) shown in separate collapsible from depends-on (kind=depends_on)', async () => {
      fetchSpy = vi.spyOn(globalThis, 'fetch').mockImplementation((url) => {
        const urlStr = String(url)
        if (urlStr.includes('/api/subsystem-docs/')) {
          return Promise.resolve(new Response('', { status: 404 }))
        }
        return Promise.reject(new Error(`Unexpected fetch: ${urlStr}`))
      })

      // Use a node with no .files so the legacy "Files" section doesn't appear
      const node = makeNode({ id: 'subsystem:x', title: 'X', files: [] })
      const outgoing = [
        makeEdge('e1', 'subsystem:x', 'subsystem:y', { kind: 'depends_on' }),
        makeEdge('e2', 'subsystem:x', 'file:src/a.ts', { kind: 'contains' }),
      ]
      useSelectionStore.setState({ selectedNodeId: 'subsystem:x' })

      const Wrapper = makeWrapper((key) => {
        if (key.startsWith('/api/node')) return Promise.resolve(makeNodeDetail(node, outgoing, []))
        return Promise.resolve(makeSnapshot([]))
      })

      render(<NodeDetailCard />, { wrapper: Wrapper })

      await waitFor(() => {
        // Both sections must be present
        expect(screen.getByText(/depends on/i)).toBeInTheDocument()
        // The contains collapsible summary
        expect(screen.getByText(/contains/i)).toBeInTheDocument()
      })

      // depends_on target and contains target must each appear
      expect(screen.getByText('subsystem:y')).toBeInTheDocument()
      expect(screen.getByText(/src\/a\.ts/)).toBeInTheDocument()

      // They must NOT both be in the same <ul>
      const depsList = screen.getByText('subsystem:y').closest('ul')
      const containsList = screen.getByText(/src\/a\.ts/).closest('ul')
      expect(depsList).not.toBe(containsList)
    })
  })
})
