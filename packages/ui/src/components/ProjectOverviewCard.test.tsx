import type { Snapshot } from '@codearch/core'
import { render, screen, waitFor } from '@testing-library/react'
import { userEvent } from '@testing-library/user-event'
import type { ReactNode } from 'react'
import { SWRConfig } from 'swr'
import { beforeEach, describe, expect, it, vi } from 'vitest'
import type { OverviewResponse } from '../state/snapshot.js'
import { ProjectOverviewCard } from './ProjectOverviewCard.js'

// ─── Fixtures ─────────────────────────────────────────────────────────────────

function makeOverview(overrides?: Partial<OverviewResponse>): OverviewResponse {
  return {
    project: {
      name: 'my-project',
      root: '/repo',
      snapshotBuiltAt: '2024-01-01T00:00:00.000Z',
      snapshotScanId: '00000000-0000-0000-0000-000000000001',
    },
    counts: {
      subsystems: 4,
      files: 20,
      edges: 50,
      findings: 3,
      externalPackages: 10,
    },
    ...overrides,
  }
}

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
        id: 'sub-a',
        kind: 'subsystem',
        title: 'Sub A',
        layer: 'domain',
        status: 'unknown',
        tags: [],
        files: [],
        metadata: {},
      },
      {
        id: 'sub-b',
        kind: 'subsystem',
        title: 'Sub B',
        layer: 'domain',
        status: 'unknown',
        tags: [],
        files: [],
        metadata: {},
      },
      {
        id: 'sub-c',
        kind: 'subsystem',
        title: 'Sub C',
        layer: 'domain',
        status: 'unknown',
        tags: [],
        files: [],
        metadata: {},
      },
      {
        id: 'file-x',
        kind: 'file',
        title: 'File X',
        layer: 'domain',
        status: 'unknown',
        tags: [],
        files: [],
        metadata: {},
      },
    ],
    edges: [
      {
        id: 'e1',
        from: 'file-x',
        to: 'sub-a',
        kind: 'imports',
        category: 'structural',
        source: 'ast',
        confidence: 'high',
        evidenceIds: [],
        weight: 1,
        runtimeWeight: 0,
        typeOnlyWeight: 0,
        dynamicWeight: 0,
        metadata: {},
      },
      {
        id: 'e2',
        from: 'file-x',
        to: 'sub-a',
        kind: 'imports',
        category: 'structural',
        source: 'ast',
        confidence: 'high',
        evidenceIds: [],
        weight: 1,
        runtimeWeight: 0,
        typeOnlyWeight: 0,
        dynamicWeight: 0,
        metadata: {},
      },
      {
        id: 'e3',
        from: 'file-x',
        to: 'sub-b',
        kind: 'imports',
        category: 'structural',
        source: 'ast',
        confidence: 'high',
        evidenceIds: [],
        weight: 1,
        runtimeWeight: 0,
        typeOnlyWeight: 0,
        dynamicWeight: 0,
        metadata: {},
      },
    ],
    evidence: [],
    findings: [],
    ...overrides,
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
  // Mock fetch for scan button
  globalThis.fetch = vi.fn().mockResolvedValue({ ok: true, status: 200 })
})

// ─── Tests ────────────────────────────────────────────────────────────────────

describe('ProjectOverviewCard', () => {
  it('renders project name from overview data', async () => {
    const overview = makeOverview()
    const snapshot = makeSnapshot()

    const Wrapper = makeWrapper((key) => {
      if (key === '/api/overview') return Promise.resolve(overview)
      return Promise.resolve(snapshot)
    })

    render(<ProjectOverviewCard />, { wrapper: Wrapper })

    await waitFor(() => {
      expect(screen.getByText('my-project')).toBeInTheDocument()
    })
  })

  it('renders counts', async () => {
    const overview = makeOverview()
    const snapshot = makeSnapshot()

    const Wrapper = makeWrapper((key) => {
      if (key === '/api/overview') return Promise.resolve(overview)
      return Promise.resolve(snapshot)
    })

    render(<ProjectOverviewCard />, { wrapper: Wrapper })

    await waitFor(() => {
      expect(screen.getByTestId('count-subsystems').textContent).toBe('4')
      expect(screen.getByTestId('count-files').textContent).toBe('20')
      expect(screen.getByTestId('count-edges').textContent).toBe('50')
      expect(screen.getByTestId('count-findings').textContent).toBe('3')
      expect(screen.getByTestId('count-external-packages').textContent).toBe('10')
    })
  })

  it('renders "Last scan: X ago" using formatTimeAgo', async () => {
    // Use a recent timestamp so we get a predictable "just now" or similar
    const builtAt = new Date(Date.now() - 5 * 60 * 1000).toISOString() // 5 min ago
    const overview = makeOverview({
      project: {
        name: 'my-project',
        root: '/repo',
        snapshotBuiltAt: builtAt,
        snapshotScanId: '00000000-0000-0000-0000-000000000001',
      },
    })
    const snapshot = makeSnapshot()

    const Wrapper = makeWrapper((key) => {
      if (key === '/api/overview') return Promise.resolve(overview)
      return Promise.resolve(snapshot)
    })

    render(<ProjectOverviewCard />, { wrapper: Wrapper })

    await waitFor(() => {
      const lastScan = screen.getByTestId('last-scan')
      expect(lastScan.textContent).toMatch(/Last scan:/)
      expect(lastScan.textContent).toMatch(/ago/)
      // Regression guard: formatTimeAgo already returns "X ago" — the component
      // must not append a second " ago" suffix (would render "5m ago ago").
      const agoOccurrences = (lastScan.textContent ?? '').match(/\bago\b/g) ?? []
      expect(agoOccurrences).toHaveLength(1)
    })
  })

  it('renders up to 5 top hubs', async () => {
    const overview = makeOverview()
    const snapshot = makeSnapshot({
      nodes: [
        {
          id: 'sub-a',
          kind: 'subsystem',
          title: 'Sub A',
          layer: 'domain',
          status: 'unknown',
          tags: [],
          files: [],
          metadata: {},
        },
        {
          id: 'sub-b',
          kind: 'subsystem',
          title: 'Sub B',
          layer: 'domain',
          status: 'unknown',
          tags: [],
          files: [],
          metadata: {},
        },
        {
          id: 'sub-c',
          kind: 'subsystem',
          title: 'Sub C',
          layer: 'domain',
          status: 'unknown',
          tags: [],
          files: [],
          metadata: {},
        },
        {
          id: 'sub-d',
          kind: 'subsystem',
          title: 'Sub D',
          layer: 'domain',
          status: 'unknown',
          tags: [],
          files: [],
          metadata: {},
        },
        {
          id: 'sub-e',
          kind: 'subsystem',
          title: 'Sub E',
          layer: 'domain',
          status: 'unknown',
          tags: [],
          files: [],
          metadata: {},
        },
        {
          id: 'sub-f',
          kind: 'subsystem',
          title: 'Sub F',
          layer: 'domain',
          status: 'unknown',
          tags: [],
          files: [],
          metadata: {},
        },
      ],
      edges: [
        {
          id: 'e1',
          from: 'x',
          to: 'sub-a',
          kind: 'imports',
          category: 'structural',
          source: 'ast',
          confidence: 'high',
          evidenceIds: [],
          weight: 1,
          runtimeWeight: 0,
          typeOnlyWeight: 0,
          dynamicWeight: 0,
          metadata: {},
        },
        {
          id: 'e2',
          from: 'x',
          to: 'sub-b',
          kind: 'imports',
          category: 'structural',
          source: 'ast',
          confidence: 'high',
          evidenceIds: [],
          weight: 1,
          runtimeWeight: 0,
          typeOnlyWeight: 0,
          dynamicWeight: 0,
          metadata: {},
        },
        {
          id: 'e3',
          from: 'x',
          to: 'sub-c',
          kind: 'imports',
          category: 'structural',
          source: 'ast',
          confidence: 'high',
          evidenceIds: [],
          weight: 1,
          runtimeWeight: 0,
          typeOnlyWeight: 0,
          dynamicWeight: 0,
          metadata: {},
        },
        {
          id: 'e4',
          from: 'x',
          to: 'sub-d',
          kind: 'imports',
          category: 'structural',
          source: 'ast',
          confidence: 'high',
          evidenceIds: [],
          weight: 1,
          runtimeWeight: 0,
          typeOnlyWeight: 0,
          dynamicWeight: 0,
          metadata: {},
        },
        {
          id: 'e5',
          from: 'x',
          to: 'sub-e',
          kind: 'imports',
          category: 'structural',
          source: 'ast',
          confidence: 'high',
          evidenceIds: [],
          weight: 1,
          runtimeWeight: 0,
          typeOnlyWeight: 0,
          dynamicWeight: 0,
          metadata: {},
        },
        {
          id: 'e6',
          from: 'x',
          to: 'sub-f',
          kind: 'imports',
          category: 'structural',
          source: 'ast',
          confidence: 'high',
          evidenceIds: [],
          weight: 1,
          runtimeWeight: 0,
          typeOnlyWeight: 0,
          dynamicWeight: 0,
          metadata: {},
        },
      ],
    })

    const Wrapper = makeWrapper((key) => {
      if (key === '/api/overview') return Promise.resolve(overview)
      return Promise.resolve(snapshot)
    })

    render(<ProjectOverviewCard />, { wrapper: Wrapper })

    await waitFor(() => {
      const hubsSection = screen.getByTestId('top-hubs')
      const listItems = hubsSection.querySelectorAll('li')
      expect(listItems.length).toBeLessThanOrEqual(5)
      expect(listItems.length).toBeGreaterThan(0)
    })
  })

  it('"Run scan" button click triggers a POST to /api/scan', async () => {
    const user = userEvent.setup()
    const overview = makeOverview()
    const snapshot = makeSnapshot()

    const Wrapper = makeWrapper((key) => {
      if (key === '/api/overview') return Promise.resolve(overview)
      return Promise.resolve(snapshot)
    })

    render(<ProjectOverviewCard />, { wrapper: Wrapper })

    const btn = screen.getByRole('button', { name: /run scan/i })
    await user.click(btn)

    expect(globalThis.fetch).toHaveBeenCalledWith('/api/scan', { method: 'POST' })
  })

  it('"Copy MCP config" click invokes navigator.clipboard.writeText with the expected snippet', async () => {
    // userEvent.setup() installs a ClipboardStub on window.navigator.clipboard.
    // We spy on writeText AFTER setup() so our spy targets the actual stub
    // that the component will call.
    const user = userEvent.setup()
    const writeTextSpy = vi.spyOn(window.navigator.clipboard, 'writeText')

    const overview = makeOverview()
    const snapshot = makeSnapshot()

    const Wrapper = makeWrapper((key) => {
      if (key === '/api/overview') return Promise.resolve(overview)
      return Promise.resolve(snapshot)
    })

    render(<ProjectOverviewCard />, { wrapper: Wrapper })

    const btn = screen.getByRole('button', { name: /copy mcp config/i })
    await user.click(btn)

    expect(writeTextSpy).toHaveBeenCalledWith(expect.stringContaining('"vibegraph"'))
    expect(writeTextSpy).toHaveBeenCalledWith(expect.stringContaining('"vibe-graph"'))

    // Shows "Copied!" feedback
    await waitFor(() => {
      expect(screen.getByRole('button', { name: /copied!/i })).toBeInTheDocument()
    })
  })

  it('top hubs display node titles, not raw IDs (Plan C §5.2)', async () => {
    const overview = makeOverview()
    const snapshot = makeSnapshot({
      nodes: [
        {
          id: 'subsystem:synastry',
          kind: 'subsystem',
          title: 'Synastry',
          layer: 'domain',
          status: 'unknown',
          tags: [],
          files: [],
          metadata: {},
        },
        {
          id: 'subsystem:aspects',
          kind: 'subsystem',
          title: 'Aspects',
          layer: 'domain',
          status: 'unknown',
          tags: [],
          files: [],
          metadata: {},
        },
      ],
      edges: [
        {
          id: 'e1',
          from: 'x',
          to: 'subsystem:synastry',
          kind: 'imports',
          category: 'structural',
          source: 'ast',
          confidence: 'high',
          evidenceIds: [],
          weight: 1,
          runtimeWeight: 0,
          typeOnlyWeight: 0,
          dynamicWeight: 0,
          metadata: {},
        },
        {
          id: 'e2',
          from: 'x',
          to: 'subsystem:synastry',
          kind: 'imports',
          category: 'structural',
          source: 'ast',
          confidence: 'high',
          evidenceIds: [],
          weight: 1,
          runtimeWeight: 0,
          typeOnlyWeight: 0,
          dynamicWeight: 0,
          metadata: {},
        },
        {
          id: 'e3',
          from: 'x',
          to: 'subsystem:synastry',
          kind: 'imports',
          category: 'structural',
          source: 'ast',
          confidence: 'high',
          evidenceIds: [],
          weight: 1,
          runtimeWeight: 0,
          typeOnlyWeight: 0,
          dynamicWeight: 0,
          metadata: {},
        },
        {
          id: 'e4',
          from: 'x',
          to: 'subsystem:synastry',
          kind: 'imports',
          category: 'structural',
          source: 'ast',
          confidence: 'high',
          evidenceIds: [],
          weight: 1,
          runtimeWeight: 0,
          typeOnlyWeight: 0,
          dynamicWeight: 0,
          metadata: {},
        },
        {
          id: 'e5',
          from: 'x',
          to: 'subsystem:synastry',
          kind: 'imports',
          category: 'structural',
          source: 'ast',
          confidence: 'high',
          evidenceIds: [],
          weight: 1,
          runtimeWeight: 0,
          typeOnlyWeight: 0,
          dynamicWeight: 0,
          metadata: {},
        },
        {
          id: 'e6',
          from: 'x',
          to: 'subsystem:synastry',
          kind: 'imports',
          category: 'structural',
          source: 'ast',
          confidence: 'high',
          evidenceIds: [],
          weight: 1,
          runtimeWeight: 0,
          typeOnlyWeight: 0,
          dynamicWeight: 0,
          metadata: {},
        },
      ],
    })

    const Wrapper = makeWrapper((key) => {
      if (key === '/api/overview') return Promise.resolve(overview)
      return Promise.resolve(snapshot)
    })

    render(<ProjectOverviewCard />, { wrapper: Wrapper })

    await waitFor(() => {
      // Should display the title "Synastry" with count (6)
      expect(screen.getByText(/Synastry \(6\)/)).toBeInTheDocument()
      // Should NOT display the raw ID
      expect(screen.queryByText(/subsystem:synastry/)).not.toBeInTheDocument()
    })
  })
})
