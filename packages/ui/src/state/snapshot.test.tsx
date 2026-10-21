import { renderHook, waitFor } from '@testing-library/react'
import type { ReactNode } from 'react'
import { SWRConfig } from 'swr'
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import {
  useBlastRadius,
  useContextPack,
  useEvidence,
  useFindings,
  useNode,
  useOverview,
  useSnapshot,
} from './snapshot.js'

// ─── Stub data shapes ─────────────────────────────────────────────────────────

const STUB_SNAPSHOT = {
  meta: {
    projectName: 'test',
    projectRoot: '/test',
    builtAt: '2024-01-01',
    scanId: 'abc',
    schemaVersion: '0.1.0',
  },
  nodes: [],
  edges: [],
  findings: [],
  evidence: [],
}

const STUB_OVERVIEW = {
  project: { name: 'test', root: '/test', snapshotBuiltAt: '2024-01-01', snapshotScanId: 'abc' },
  counts: { subsystems: 0, files: 0, edges: 0, findings: 0, externalPackages: 0 },
}

const STUB_FINDINGS = { findings: [] }

const STUB_NODE_DETAIL = {
  node: { id: 'node-1', kind: 'file' as const, title: 'test', path: 'test.ts' },
  outgoing: [],
  incoming: [],
}

const STUB_BLAST_RADIUS = {
  target: { nodeId: 'node-1', title: 'test', kind: 'file' as const },
  depth: 1,
  nodes: [],
  edges: [],
  stats: { totalNodes: 0, totalEdges: 0, maxDepthReached: 0 },
}

const STUB_CONTEXT_PACK = {
  target: { nodeId: 'node-1', title: 'test', kind: 'file' as const },
  files: [],
  findings: [],
  relationships: [],
  tokenEstimate: 0,
}

// ─── Test wrapper ─────────────────────────────────────────────────────────────

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

// ─── Tests ───────────────────────────────────────────────────────────────────

describe('useSnapshot', () => {
  it('returns undefined initially, then resolves to snapshot data', async () => {
    const fetcher = vi.fn().mockResolvedValue(STUB_SNAPSHOT)
    const wrapper = makeWrapper(fetcher)

    const { result } = renderHook(() => useSnapshot(), { wrapper })

    expect(result.current.data).toBeUndefined()
    await waitFor(() => expect(result.current.data).toBeDefined())
    expect(result.current.data).toEqual(STUB_SNAPSHOT)
    expect(fetcher).toHaveBeenCalledWith('/api/snapshot')
  })
})

describe('useOverview', () => {
  it('returns undefined initially, then resolves to overview data', async () => {
    const fetcher = vi.fn().mockResolvedValue(STUB_OVERVIEW)
    const wrapper = makeWrapper(fetcher)

    const { result } = renderHook(() => useOverview(), { wrapper })

    expect(result.current.data).toBeUndefined()
    await waitFor(() => expect(result.current.data).toBeDefined())
    expect(result.current.data).toEqual(STUB_OVERVIEW)
    expect(fetcher).toHaveBeenCalledWith('/api/overview')
  })
})

describe('useFindings', () => {
  it('calls /api/findings with no opts', async () => {
    const fetcher = vi.fn().mockResolvedValue(STUB_FINDINGS)
    const wrapper = makeWrapper(fetcher)

    const { result } = renderHook(() => useFindings(), { wrapper })

    await waitFor(() => expect(result.current.data).toBeDefined())
    expect(fetcher).toHaveBeenCalledWith('/api/findings')
  })

  it('appends domain query param when provided', async () => {
    const fetcher = vi.fn().mockResolvedValue(STUB_FINDINGS)
    const wrapper = makeWrapper(fetcher)

    const { result } = renderHook(() => useFindings({ domain: 'architecture' }), { wrapper })

    await waitFor(() => expect(result.current.data).toBeDefined())
    expect(fetcher).toHaveBeenCalledWith('/api/findings?domain=architecture')
  })

  it('appends multiple query params when provided', async () => {
    const fetcher = vi.fn().mockResolvedValue(STUB_FINDINGS)
    const wrapper = makeWrapper(fetcher)

    const { result } = renderHook(() => useFindings({ domain: 'security', severity: 'high' }), {
      wrapper,
    })

    await waitFor(() => expect(result.current.data).toBeDefined())
    const calledUrl = fetcher.mock.calls[0]?.[0] as string
    expect(calledUrl).toContain('domain=security')
    expect(calledUrl).toContain('severity=high')
  })
})

describe('useNode', () => {
  it('pauses (does not call fetcher) when id is null', () => {
    const fetcher = vi.fn().mockResolvedValue(STUB_NODE_DETAIL)
    const wrapper = makeWrapper(fetcher)

    renderHook(() => useNode(null), { wrapper })

    expect(fetcher).not.toHaveBeenCalled()
  })

  it('fetches node detail when id is provided', async () => {
    const fetcher = vi.fn().mockResolvedValue(STUB_NODE_DETAIL)
    const wrapper = makeWrapper(fetcher)

    const { result } = renderHook(() => useNode('node-1'), { wrapper })

    await waitFor(() => expect(result.current.data).toBeDefined())
    expect(fetcher).toHaveBeenCalledWith('/api/node?id=node-1')
  })
})

describe('useBlastRadius', () => {
  it('pauses when target is null', () => {
    const fetcher = vi.fn().mockResolvedValue(STUB_BLAST_RADIUS)
    const wrapper = makeWrapper(fetcher)

    renderHook(() => useBlastRadius(null), { wrapper })

    expect(fetcher).not.toHaveBeenCalled()
  })

  it('fetches blast radius when target is provided', async () => {
    const fetcher = vi.fn().mockResolvedValue(STUB_BLAST_RADIUS)
    const wrapper = makeWrapper(fetcher)

    const { result } = renderHook(() => useBlastRadius('node-1'), { wrapper })

    await waitFor(() => expect(result.current.data).toBeDefined())
    expect(fetcher).toHaveBeenCalledWith('/api/blast-radius?target=node-1')
  })

  it('appends maxDepth when provided', async () => {
    const fetcher = vi.fn().mockResolvedValue(STUB_BLAST_RADIUS)
    const wrapper = makeWrapper(fetcher)

    const { result } = renderHook(() => useBlastRadius('node-1', 3), { wrapper })

    await waitFor(() => expect(result.current.data).toBeDefined())
    expect(fetcher).toHaveBeenCalledWith('/api/blast-radius?target=node-1&maxDepth=3')
  })
})

describe('useContextPack', () => {
  it('pauses when target is null', () => {
    const fetcher = vi.fn().mockResolvedValue(STUB_CONTEXT_PACK)
    const wrapper = makeWrapper(fetcher)

    renderHook(() => useContextPack(null), { wrapper })

    expect(fetcher).not.toHaveBeenCalled()
  })

  it('fetches context pack when target is provided', async () => {
    const fetcher = vi.fn().mockResolvedValue(STUB_CONTEXT_PACK)
    const wrapper = makeWrapper(fetcher)

    const { result } = renderHook(() => useContextPack('node-1'), { wrapper })

    await waitFor(() => expect(result.current.data).toBeDefined())
    expect(fetcher).toHaveBeenCalledWith('/api/context-pack?target=node-1')
  })

  it('appends maxTokens when provided', async () => {
    const fetcher = vi.fn().mockResolvedValue(STUB_CONTEXT_PACK)
    const wrapper = makeWrapper(fetcher)

    const { result } = renderHook(() => useContextPack('node-1', { maxTokens: 4000 }), { wrapper })

    await waitFor(() => expect(result.current.data).toBeDefined())
    expect(fetcher).toHaveBeenCalledWith('/api/context-pack?target=node-1&maxTokens=4000')
  })
})

describe('useEvidence', () => {
  const STUB_EVIDENCE = {
    id: 'ev-1',
    sourceKind: 'ast',
    file: '/src/auth/service.ts',
    line: 42,
    detail: 'import statement',
    confidence: 'high',
    coupling: 'runtime',
  }

  it('pauses (does not call fetcher) when id is null', () => {
    const fetcher = vi.fn().mockResolvedValue(STUB_EVIDENCE)
    const wrapper = makeWrapper(fetcher)

    renderHook(() => useEvidence(null), { wrapper })

    expect(fetcher).not.toHaveBeenCalled()
  })

  it('fetches evidence when id is provided', async () => {
    const fetcher = vi.fn().mockResolvedValue(STUB_EVIDENCE)
    const wrapper = makeWrapper(fetcher)

    const { result } = renderHook(() => useEvidence('ev-1'), { wrapper })

    await waitFor(() => expect(result.current.data).toBeDefined())
    expect(fetcher).toHaveBeenCalledWith('/api/evidence?id=ev-1')
  })

  it('url-encodes the id', async () => {
    const fetcher = vi.fn().mockResolvedValue(STUB_EVIDENCE)
    const wrapper = makeWrapper(fetcher)

    const { result } = renderHook(() => useEvidence('ev with spaces'), { wrapper })

    await waitFor(() => expect(result.current.data).toBeDefined())
    expect(fetcher).toHaveBeenCalledWith('/api/evidence?id=ev%20with%20spaces')
  })
})
