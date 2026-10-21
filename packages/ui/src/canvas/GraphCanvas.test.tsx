import type { BlastRadiusResult, Snapshot } from '@codearch/core'
import { fireEvent, render, waitFor } from '@testing-library/react'
import { SWRConfig } from 'swr'
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import { useDiffStore } from '../state/diff.js'
import { useFiltersStore } from '../state/filters.js'
import { useLayoutStore } from '../state/layout.js'
import { useSelectionStore } from '../state/selection.js'
import { GraphCanvas } from './GraphCanvas.js'
import type { LayoutResult } from './graph-layout.js'

// Minimal valid Snapshot fixture (all required fields per schema).
// Typed as `: Snapshot` — compile-time check that the fixture matches the real schema.
const baseSnapshot: Snapshot = {
  meta: {
    schemaVersion: '0.1.0',
    scanId: '00000000-0000-0000-0000-000000000001',
    builtAt: '2024-01-01T00:00:00.000Z',
    projectRoot: '/project',
    projectName: 'test-project',
    vibegraphVersion: '0.0.0',
    scanDurationMs: 0,
    fileCounts: { scanned: 0, indexed: 0, skipped: 0 },
  },
  nodes: [
    {
      id: 'subsystem:a',
      kind: 'subsystem',
      title: 'A',
      layer: 'domain',
      status: 'unknown',
      tags: [],
      files: [],
      metadata: {},
    },
    {
      id: 'subsystem:b',
      kind: 'subsystem',
      title: 'B',
      layer: 'domain',
      status: 'unknown',
      tags: [],
      files: [],
      metadata: {},
    },
    {
      id: 'subsystem:c',
      kind: 'subsystem',
      title: 'C',
      layer: 'horizontal',
      status: 'unknown',
      tags: [],
      files: [],
      metadata: {},
    },
  ],
  edges: [
    {
      id: 'a-b',
      from: 'subsystem:a',
      to: 'subsystem:b',
      kind: 'depends_on',
      category: 'structural',
      source: 'manual',
      confidence: 'high',
      evidenceIds: [],
      weight: 1,
      runtimeWeight: 0,
      typeOnlyWeight: 0,
      dynamicWeight: 0,
      metadata: {},
    },
    {
      id: 'b-c',
      from: 'subsystem:b',
      to: 'subsystem:c',
      kind: 'depends_on',
      category: 'structural',
      source: 'manual',
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
}

// Pre-computed layout so tests don't depend on dagre internals
const fixedLayout: LayoutResult = {
  nodes: [
    { id: 'subsystem:a', x: 100, y: 100 },
    { id: 'subsystem:b', x: 300, y: 100 },
    { id: 'subsystem:c', x: 500, y: 100 },
  ],
  edges: [
    {
      id: 'a-b',
      points: [
        { x: 100, y: 100 },
        { x: 300, y: 100 },
      ],
    },
    {
      id: 'b-c',
      points: [
        { x: 300, y: 100 },
        { x: 500, y: 100 },
      ],
    },
  ],
  width: 600,
  height: 200,
}

describe('GraphCanvas', () => {
  beforeEach(() => {
    useSelectionStore.getState().clear()
  })

  it('has data-testid="graph-canvas" on the root <svg>', () => {
    const { container } = render(<GraphCanvas snapshot={baseSnapshot} layout={fixedLayout} />)
    const svg = container.querySelector('svg')
    expect(svg).toHaveAttribute('data-testid', 'graph-canvas')
  })

  it('renders 3 circles for 3 subsystem nodes', () => {
    const { container } = render(<GraphCanvas snapshot={baseSnapshot} layout={fixedLayout} />)
    const circles = container.querySelectorAll('circle')
    expect(circles).toHaveLength(3)
  })

  it('renders 2 paths for 2 edges', () => {
    const { container } = render(<GraphCanvas snapshot={baseSnapshot} layout={fixedLayout} />)
    const paths = container.querySelectorAll('path.vg-edge')
    expect(paths).toHaveLength(2)
  })

  it('each circle has the correct data-node-id', () => {
    const { container } = render(<GraphCanvas snapshot={baseSnapshot} layout={fixedLayout} />)
    const nodeIds = Array.from(container.querySelectorAll('circle')).map((c) =>
      c.getAttribute('data-node-id'),
    )
    expect(nodeIds).toContain('subsystem:a')
    expect(nodeIds).toContain('subsystem:b')
    expect(nodeIds).toContain('subsystem:c')
  })

  it('each path has the correct data-edge-id', () => {
    const { container } = render(<GraphCanvas snapshot={baseSnapshot} layout={fixedLayout} />)
    const edgeIds = Array.from(container.querySelectorAll('path.vg-edge')).map((p) =>
      p.getAttribute('data-edge-id'),
    )
    expect(edgeIds).toContain('a-b')
    expect(edgeIds).toContain('b-c')
  })

  it('subsystem-only filter: file nodes are NOT rendered', () => {
    const snapshotWithFile: Snapshot = {
      ...baseSnapshot,
      nodes: [
        ...baseSnapshot.nodes,
        {
          id: 'file:some/file.ts',
          kind: 'file',
          title: 'file.ts',
          layer: 'domain',
          status: 'unknown',
          tags: [],
          files: [],
          metadata: {},
        },
      ],
    }
    const { container } = render(<GraphCanvas snapshot={snapshotWithFile} layout={fixedLayout} />)
    // Only 3 circles — the file node is filtered out
    const circles = container.querySelectorAll('circle')
    expect(circles).toHaveLength(3)
    const nodeIds = Array.from(circles).map((c) => c.getAttribute('data-node-id'))
    expect(nodeIds).not.toContain('file:some/file.ts')
  })

  it('empty/loading state: renders empty <svg data-testid="graph-canvas" /> with no snapshot', () => {
    const { container } = render(<GraphCanvas />)
    const svg = container.querySelector('svg')
    expect(svg).toHaveAttribute('data-testid', 'graph-canvas')
    expect(container.querySelectorAll('circle')).toHaveLength(0)
    expect(container.querySelectorAll('path.vg-edge')).toHaveLength(0)
  })
})

describe('GraphCanvas — selection + hover', () => {
  beforeEach(() => {
    useSelectionStore.getState().clear()
  })

  it('inner <g class="vg-viewport"> exists', () => {
    const { container } = render(<GraphCanvas snapshot={baseSnapshot} layout={fixedLayout} />)
    const viewport = container.querySelector('g.vg-viewport')
    expect(viewport).not.toBeNull()
  })

  it('initial transform is identity (empty string or absent)', () => {
    const { container } = render(<GraphCanvas snapshot={baseSnapshot} layout={fixedLayout} />)
    const viewport = container.querySelector('g.vg-viewport')
    const transform = viewport?.getAttribute('transform') ?? ''
    // Identity means either empty string or "translate(0,0) scale(1)"
    expect(transform === '' || transform === 'translate(0,0) scale(1)').toBe(true)
  })

  it('clicking a node circle sets selectedNodeId in store', () => {
    const { container } = render(<GraphCanvas snapshot={baseSnapshot} layout={fixedLayout} />)
    const circle = container.querySelector('circle[data-node-id="subsystem:a"]')
    if (circle == null) throw new Error('circle not found')
    fireEvent.click(circle)
    expect(useSelectionStore.getState().selectedNodeId).toBe('subsystem:a')
  })

  it('clicking a second node updates selection to the new node', () => {
    const { container } = render(<GraphCanvas snapshot={baseSnapshot} layout={fixedLayout} />)
    const circleA = container.querySelector('circle[data-node-id="subsystem:a"]')
    const circleB = container.querySelector('circle[data-node-id="subsystem:b"]')
    if (circleA == null || circleB == null) throw new Error('circles not found')
    fireEvent.click(circleA)
    expect(useSelectionStore.getState().selectedNodeId).toBe('subsystem:a')
    fireEvent.click(circleB)
    expect(useSelectionStore.getState().selectedNodeId).toBe('subsystem:b')
  })

  it('selected node has data-selected="true" on its <g>', () => {
    // Set store before render
    useSelectionStore.getState().setSelectedNode('subsystem:a')
    const { container } = render(<GraphCanvas snapshot={baseSnapshot} layout={fixedLayout} />)
    // Find the vg-node g for subsystem:a
    const nodeG = container.querySelector('g.vg-node[data-selected="true"]')
    expect(nodeG).not.toBeNull()
    expect(nodeG?.querySelector('circle[data-node-id="subsystem:a"]')).not.toBeNull()
  })

  it('hover enter sets hoveredNodeId in store', () => {
    const { container } = render(<GraphCanvas snapshot={baseSnapshot} layout={fixedLayout} />)
    const circle = container.querySelector('circle[data-node-id="subsystem:b"]')
    if (circle == null) throw new Error('circle not found')
    fireEvent.mouseEnter(circle)
    expect(useSelectionStore.getState().hoveredNodeId).toBe('subsystem:b')
  })

  it('hover leave clears hoveredNodeId in store', () => {
    const { container } = render(<GraphCanvas snapshot={baseSnapshot} layout={fixedLayout} />)
    const circle = container.querySelector('circle[data-node-id="subsystem:b"]')
    if (circle == null) throw new Error('circle not found')
    fireEvent.mouseEnter(circle)
    expect(useSelectionStore.getState().hoveredNodeId).toBe('subsystem:b')
    fireEvent.mouseLeave(circle)
    expect(useSelectionStore.getState().hoveredNodeId).toBeNull()
  })

  it('clicking the SVG background clears selection', () => {
    useSelectionStore.getState().setSelectedNode('subsystem:a')
    const { container } = render(<GraphCanvas snapshot={baseSnapshot} layout={fixedLayout} />)
    const svg = container.querySelector('svg')
    if (svg == null) throw new Error('svg not found')
    // Click directly on the svg (not a node circle)
    fireEvent.click(svg)
    expect(useSelectionStore.getState().selectedNodeId).toBeNull()
  })

  it('clicking the viewport <g> (not a node) clears selection', () => {
    useSelectionStore.getState().setSelectedNode('subsystem:a')
    const { container } = render(<GraphCanvas snapshot={baseSnapshot} layout={fixedLayout} />)
    const viewport = container.querySelector('g.vg-viewport')
    if (viewport == null) throw new Error('viewport g not found')
    fireEvent.click(viewport)
    expect(useSelectionStore.getState().selectedNodeId).toBeNull()
  })

  it('pressing Enter on a focused circle sets selectedNodeId', () => {
    const { container } = render(<GraphCanvas snapshot={baseSnapshot} layout={fixedLayout} />)
    const circle = container.querySelector('circle[data-node-id="subsystem:a"]')
    if (circle == null) throw new Error('circle not found')
    fireEvent.keyDown(circle, { key: 'Enter' })
    expect(useSelectionStore.getState().selectedNodeId).toBe('subsystem:a')
  })

  it('pressing Escape on the SVG clears selectedNodeId', () => {
    useSelectionStore.getState().setSelectedNode('subsystem:a')
    const { container } = render(<GraphCanvas snapshot={baseSnapshot} layout={fixedLayout} />)
    const svg = container.querySelector('svg')
    if (svg == null) throw new Error('svg not found')
    fireEvent.keyDown(svg, { key: 'Escape' })
    expect(useSelectionStore.getState().selectedNodeId).toBeNull()
  })
})

const blastFixture: BlastRadiusResult = {
  direct: ['subsystem:b'],
  transitive: [],
  cycles: [],
  totalAffected: 1,
}

describe('GraphCanvas — blast radius highlighting', () => {
  beforeEach(() => {
    useSelectionStore.getState().clear()
  })

  it('useBlastRadius is called with the selected target', async () => {
    useSelectionStore.getState().setSelectedNode('subsystem:a')

    const fetcherSpy = vi.fn(async (url: string) => {
      if (url === '/api/snapshot') return baseSnapshot
      if (url.startsWith('/api/blast-radius')) return blastFixture
      throw new Error(`Unexpected URL: ${url}`)
    })

    render(
      <SWRConfig value={{ fetcher: fetcherSpy, provider: () => new Map() }}>
        <GraphCanvas snapshot={baseSnapshot} layout={fixedLayout} />
      </SWRConfig>,
    )

    await waitFor(() =>
      expect(fetcherSpy).toHaveBeenCalledWith(
        expect.stringContaining('/api/blast-radius?target=subsystem%3Aa'),
      ),
    )
  })

  it('reached nodes get data-blast-distance attribute', async () => {
    useSelectionStore.getState().setSelectedNode('subsystem:a')

    const fetcherSpy = vi.fn(async (url: string) => {
      if (url === '/api/snapshot') return baseSnapshot
      if (url.startsWith('/api/blast-radius')) return blastFixture
      throw new Error(`Unexpected URL: ${url}`)
    })

    const { container } = render(
      <SWRConfig value={{ fetcher: fetcherSpy, provider: () => new Map() }}>
        <GraphCanvas snapshot={baseSnapshot} layout={fixedLayout} />
      </SWRConfig>,
    )

    // Wait for blast radius data to be applied
    await waitFor(() =>
      expect(fetcherSpy).toHaveBeenCalledWith(expect.stringContaining('/api/blast-radius')),
    )

    // subsystem:a is the selected node itself — distance 0
    await waitFor(() => {
      const nodeA = container.querySelector('g[data-node-id="subsystem:a"]')
      expect(nodeA).toHaveAttribute('data-blast-distance', '0')
    })

    // subsystem:b is a direct dep — distance 1
    await waitFor(() => {
      const nodeB = container.querySelector('g[data-node-id="subsystem:b"]')
      expect(nodeB).toHaveAttribute('data-blast-distance', '1')
    })
  })

  it('nodes NOT in blast radius have no data-blast-distance', async () => {
    useSelectionStore.getState().setSelectedNode('subsystem:a')

    const fetcherSpy = vi.fn(async (url: string) => {
      if (url === '/api/snapshot') return baseSnapshot
      if (url.startsWith('/api/blast-radius')) return blastFixture
      throw new Error(`Unexpected URL: ${url}`)
    })

    const { container } = render(
      <SWRConfig value={{ fetcher: fetcherSpy, provider: () => new Map() }}>
        <GraphCanvas snapshot={baseSnapshot} layout={fixedLayout} />
      </SWRConfig>,
    )

    // Wait for blast radius data
    await waitFor(() =>
      expect(fetcherSpy).toHaveBeenCalledWith(expect.stringContaining('/api/blast-radius')),
    )

    // subsystem:c is not in the blast radius — should have NO data-blast-distance
    await waitFor(() => {
      const nodeC = container.querySelector('g[data-node-id="subsystem:c"]')
      expect(nodeC).not.toHaveAttribute('data-blast-distance')
    })
  })

  it('when no selection, no blast fetch happens', async () => {
    // No selection set — selectedNodeId remains null

    const fetcherSpy = vi.fn(async (url: string) => {
      if (url === '/api/snapshot') return baseSnapshot
      if (url.startsWith('/api/blast-radius')) return blastFixture
      throw new Error(`Unexpected URL: ${url}`)
    })

    render(
      <SWRConfig value={{ fetcher: fetcherSpy, provider: () => new Map() }}>
        <GraphCanvas snapshot={baseSnapshot} layout={fixedLayout} />
      </SWRConfig>,
    )

    // Give SWR a tick to potentially call the fetcher
    await new Promise((r) => setTimeout(r, 50))

    const blastCalls = fetcherSpy.mock.calls.filter(([url]) =>
      (url as string).includes('/api/blast-radius'),
    )
    expect(blastCalls).toHaveLength(0)
  })
})

// Snapshot with a→b, a→c, and isolated 'd' for focus mode tests
const focusSnapshot: Snapshot = {
  meta: {
    schemaVersion: '0.1.0',
    scanId: '00000000-0000-0000-0000-000000000002',
    builtAt: '2024-01-01T00:00:00.000Z',
    projectRoot: '/project',
    projectName: 'test-project',
    vibegraphVersion: '0.0.0',
    scanDurationMs: 0,
    fileCounts: { scanned: 0, indexed: 0, skipped: 0 },
  },
  nodes: [
    {
      id: 'subsystem:a',
      kind: 'subsystem',
      title: 'A',
      layer: 'domain',
      status: 'unknown',
      tags: [],
      files: [],
      metadata: {},
    },
    {
      id: 'subsystem:b',
      kind: 'subsystem',
      title: 'B',
      layer: 'domain',
      status: 'unknown',
      tags: [],
      files: [],
      metadata: {},
    },
    {
      id: 'subsystem:c',
      kind: 'subsystem',
      title: 'C',
      layer: 'domain',
      status: 'unknown',
      tags: [],
      files: [],
      metadata: {},
    },
    {
      id: 'subsystem:d',
      kind: 'subsystem',
      title: 'D',
      layer: 'domain',
      status: 'unknown',
      tags: [],
      files: [],
      metadata: {},
    },
  ],
  edges: [
    {
      id: 'a-b',
      from: 'subsystem:a',
      to: 'subsystem:b',
      kind: 'depends_on',
      category: 'structural',
      source: 'manual',
      confidence: 'high',
      evidenceIds: [],
      weight: 1,
      runtimeWeight: 0,
      typeOnlyWeight: 0,
      dynamicWeight: 0,
      metadata: {},
    },
    {
      id: 'a-c',
      from: 'subsystem:a',
      to: 'subsystem:c',
      kind: 'depends_on',
      category: 'structural',
      source: 'manual',
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
}

const focusLayout: LayoutResult = {
  nodes: [
    { id: 'subsystem:a', x: 100, y: 100 },
    { id: 'subsystem:b', x: 300, y: 100 },
    { id: 'subsystem:c', x: 500, y: 100 },
    { id: 'subsystem:d', x: 700, y: 100 },
  ],
  edges: [
    {
      id: 'a-b',
      points: [
        { x: 100, y: 100 },
        { x: 300, y: 100 },
      ],
    },
    {
      id: 'a-c',
      points: [
        { x: 100, y: 100 },
        { x: 500, y: 100 },
      ],
    },
  ],
  width: 800,
  height: 200,
}

describe('GraphCanvas — focus mode', () => {
  beforeEach(() => {
    useSelectionStore.getState().clear()
    useLayoutStore.getState().reset()
  })
  afterEach(() => {
    useLayoutStore.getState().reset()
  })

  it('F key toggles focusMode in layout store (false → true → false)', () => {
    const { container } = render(<GraphCanvas snapshot={focusSnapshot} layout={focusLayout} />)
    const svg = container.querySelector('svg')
    if (svg == null) throw new Error('svg not found')

    expect(useLayoutStore.getState().focusMode).toBe(false)
    fireEvent.keyDown(svg, { key: 'f' })
    expect(useLayoutStore.getState().focusMode).toBe(true)
    fireEvent.keyDown(svg, { key: 'f' })
    expect(useLayoutStore.getState().focusMode).toBe(false)
  })

  it('selected node gets data-focused="true" when focusMode is active', () => {
    useSelectionStore.getState().setSelectedNode('subsystem:a')
    useLayoutStore.getState().setFocusMode(true)
    const { container } = render(<GraphCanvas snapshot={focusSnapshot} layout={focusLayout} />)
    const nodeA = container.querySelector('g.vg-node[data-node-id="subsystem:a"]')
    expect(nodeA).toHaveAttribute('data-focused', 'true')
  })

  it('directly connected neighbors get data-focused="true"; unrelated node does not', () => {
    useSelectionStore.getState().setSelectedNode('subsystem:a')
    useLayoutStore.getState().setFocusMode(true)
    const { container } = render(<GraphCanvas snapshot={focusSnapshot} layout={focusLayout} />)

    const nodeB = container.querySelector('g.vg-node[data-node-id="subsystem:b"]')
    const nodeC = container.querySelector('g.vg-node[data-node-id="subsystem:c"]')
    const nodeD = container.querySelector('g.vg-node[data-node-id="subsystem:d"]')

    expect(nodeB).toHaveAttribute('data-focused', 'true')
    expect(nodeC).toHaveAttribute('data-focused', 'true')
    expect(nodeD).not.toHaveAttribute('data-focused')
  })

  it('edges between focused nodes get data-focused="true"', () => {
    useSelectionStore.getState().setSelectedNode('subsystem:a')
    useLayoutStore.getState().setFocusMode(true)
    const { container } = render(<GraphCanvas snapshot={focusSnapshot} layout={focusLayout} />)

    const edgeAB = container.querySelector('path.vg-edge[data-edge-id="a-b"]')
    const edgeAC = container.querySelector('path.vg-edge[data-edge-id="a-c"]')

    expect(edgeAB).toHaveAttribute('data-focused', 'true')
    expect(edgeAC).toHaveAttribute('data-focused', 'true')
  })

  it('no data-focused attrs when focusMode=true but no selection', () => {
    useLayoutStore.getState().setFocusMode(true)
    // selectedNodeId remains null
    const { container } = render(<GraphCanvas snapshot={focusSnapshot} layout={focusLayout} />)
    const focusedElements = container.querySelectorAll('[data-focused]')
    expect(focusedElements).toHaveLength(0)
  })
})

// ── Evidence badge on edge hover ─────────────────────────────────────────────

const evidenceSnapshot: Snapshot = {
  meta: {
    schemaVersion: '0.1.0',
    scanId: '00000000-0000-0000-0000-000000000003',
    builtAt: '2024-01-01T00:00:00.000Z',
    projectRoot: '/project',
    projectName: 'test-project',
    vibegraphVersion: '0.0.0',
    scanDurationMs: 0,
    fileCounts: { scanned: 0, indexed: 0, skipped: 0 },
  },
  nodes: [
    {
      id: 'subsystem:a',
      kind: 'subsystem',
      title: 'A',
      layer: 'domain',
      status: 'unknown',
      tags: [],
      files: [],
      metadata: {},
    },
    {
      id: 'subsystem:b',
      kind: 'subsystem',
      title: 'B',
      layer: 'domain',
      status: 'unknown',
      tags: [],
      files: [],
      metadata: {},
    },
  ],
  edges: [
    {
      id: 'a-b',
      from: 'subsystem:a',
      to: 'subsystem:b',
      kind: 'depends_on',
      category: 'structural',
      source: 'manual',
      confidence: 'high',
      evidenceIds: ['ev1', 'ev2', 'ev3', 'ev4', 'ev5'],
      weight: 1,
      runtimeWeight: 0,
      typeOnlyWeight: 0,
      dynamicWeight: 0,
      metadata: {},
    },
  ],
  evidence: [
    {
      id: 'ev1',
      sourceKind: 'ast',
      file: 'src/a.ts',
      line: 1,
      detail: 'import',
      confidence: 'high',
      coupling: 'runtime',
    },
    {
      id: 'ev2',
      sourceKind: 'ast',
      file: 'src/b.ts',
      line: 2,
      detail: 'import',
      confidence: 'high',
      coupling: 'runtime',
    },
    {
      id: 'ev3',
      sourceKind: 'ast',
      file: 'src/c.ts',
      line: 3,
      detail: 'import',
      confidence: 'high',
      coupling: 'runtime',
    },
    {
      id: 'ev4',
      sourceKind: 'ast',
      file: 'src/d.ts',
      line: 4,
      detail: 'import',
      confidence: 'high',
      coupling: 'runtime',
    },
    {
      id: 'ev5',
      sourceKind: 'ast',
      file: 'src/e.ts',
      line: 5,
      detail: 'import',
      confidence: 'high',
      coupling: 'runtime',
    },
  ],
  findings: [],
}

const evidenceLayout: LayoutResult = {
  nodes: [
    { id: 'subsystem:a', x: 100, y: 100 },
    { id: 'subsystem:b', x: 300, y: 100 },
  ],
  edges: [
    {
      id: 'a-b',
      points: [
        { x: 100, y: 100 },
        { x: 200, y: 100 },
        { x: 300, y: 100 },
      ],
    },
  ],
  width: 400,
  height: 200,
}

describe('GraphCanvas — evidence badge on edge hover', () => {
  beforeEach(() => {
    useSelectionStore.getState().clear()
    useLayoutStore.getState().reset()
  })
  afterEach(() => {
    useLayoutStore.getState().reset()
  })

  it('no evidence badge initially', () => {
    const { container } = render(
      <GraphCanvas snapshot={evidenceSnapshot} layout={evidenceLayout} />,
    )
    const badge = container.querySelector('.evidence-badge')
    expect(badge).toBeNull()
  })

  it('hovering an edge with 5 evidence items shows a badge with 3 text lines', () => {
    const { container } = render(
      <GraphCanvas snapshot={evidenceSnapshot} layout={evidenceLayout} />,
    )
    const edgePath = container.querySelector('path[data-edge-id="a-b"]')
    if (edgePath == null) throw new Error('edge path not found')

    fireEvent.mouseEnter(edgePath)

    const badge = container.querySelector('.evidence-badge')
    expect(badge).not.toBeNull()

    const texts = badge?.querySelectorAll('text')
    expect(texts).toHaveLength(3)
    // Verify the first 3 evidence items are shown (in order)
    expect(texts?.[0]?.textContent).toBe('src/a.ts:1')
    expect(texts?.[1]?.textContent).toBe('src/b.ts:2')
    expect(texts?.[2]?.textContent).toBe('src/c.ts:3')
  })

  it('mouseLeave removes the evidence badge', () => {
    const { container } = render(
      <GraphCanvas snapshot={evidenceSnapshot} layout={evidenceLayout} />,
    )
    const edgePath = container.querySelector('path[data-edge-id="a-b"]')
    if (edgePath == null) throw new Error('edge path not found')

    fireEvent.mouseEnter(edgePath)
    expect(container.querySelector('.evidence-badge')).not.toBeNull()

    fireEvent.mouseLeave(edgePath)
    expect(container.querySelector('.evidence-badge')).toBeNull()
  })
})

// ── Filter wiring ─────────────────────────────────────────────────────────────

// A snapshot with one subsystem node and one external node.
const externalSnapshot: Snapshot = {
  meta: {
    schemaVersion: '0.1.0',
    scanId: '00000000-0000-0000-0000-000000000010',
    builtAt: '2024-01-01T00:00:00.000Z',
    projectRoot: '/project',
    projectName: 'test-project',
    vibegraphVersion: '0.0.0',
    scanDurationMs: 0,
    fileCounts: { scanned: 0, indexed: 0, skipped: 0 },
  },
  nodes: [
    {
      id: 'subsystem:s1',
      kind: 'subsystem',
      title: 'S1',
      layer: 'domain',
      status: 'unknown',
      tags: [],
      files: [],
      metadata: {},
    },
    {
      id: 'external:e1',
      kind: 'external',
      title: 'E1',
      layer: 'external',
      status: 'unknown',
      tags: [],
      files: [],
      metadata: {},
    },
  ],
  edges: [
    {
      id: 's1-e1',
      from: 'subsystem:s1',
      to: 'external:e1',
      kind: 'depends_on',
      category: 'structural',
      source: 'manual',
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
}

const externalLayout: LayoutResult = {
  nodes: [
    { id: 'subsystem:s1', x: 100, y: 100 },
    { id: 'external:e1', x: 300, y: 100 },
  ],
  edges: [
    {
      id: 's1-e1',
      points: [
        { x: 100, y: 100 },
        { x: 300, y: 100 },
      ],
    },
  ],
  width: 400,
  height: 200,
}

// A snapshot with two subsystems of different layers, and edges between them.
const layerSnapshot: Snapshot = {
  meta: {
    schemaVersion: '0.1.0',
    scanId: '00000000-0000-0000-0000-000000000011',
    builtAt: '2024-01-01T00:00:00.000Z',
    projectRoot: '/project',
    projectName: 'test-project',
    vibegraphVersion: '0.0.0',
    scanDurationMs: 0,
    fileCounts: { scanned: 0, indexed: 0, skipped: 0 },
  },
  nodes: [
    {
      id: 'subsystem:dom',
      kind: 'subsystem',
      title: 'DomainNode',
      layer: 'domain',
      status: 'unknown',
      tags: [],
      files: [],
      metadata: {},
    },
    {
      id: 'subsystem:horiz',
      kind: 'subsystem',
      title: 'HorizNode',
      layer: 'horizontal',
      status: 'unknown',
      tags: [],
      files: [],
      metadata: {},
    },
  ],
  edges: [
    {
      id: 'dom-horiz',
      from: 'subsystem:dom',
      to: 'subsystem:horiz',
      kind: 'depends_on',
      category: 'structural',
      source: 'manual',
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
}

const layerLayout: LayoutResult = {
  nodes: [
    { id: 'subsystem:dom', x: 100, y: 100 },
    { id: 'subsystem:horiz', x: 300, y: 100 },
  ],
  edges: [
    {
      id: 'dom-horiz',
      points: [
        { x: 100, y: 100 },
        { x: 300, y: 100 },
      ],
    },
  ],
  width: 400,
  height: 200,
}

// A snapshot with edges of different kinds and confidence levels.
const edgeKindSnapshot: Snapshot = {
  meta: {
    schemaVersion: '0.1.0',
    scanId: '00000000-0000-0000-0000-000000000012',
    builtAt: '2024-01-01T00:00:00.000Z',
    projectRoot: '/project',
    projectName: 'test-project',
    vibegraphVersion: '0.0.0',
    scanDurationMs: 0,
    fileCounts: { scanned: 0, indexed: 0, skipped: 0 },
  },
  nodes: [
    {
      id: 'subsystem:a',
      kind: 'subsystem',
      title: 'A',
      layer: 'domain',
      status: 'unknown',
      tags: [],
      files: [],
      metadata: {},
    },
    {
      id: 'subsystem:b',
      kind: 'subsystem',
      title: 'B',
      layer: 'domain',
      status: 'unknown',
      tags: [],
      files: [],
      metadata: {},
    },
    {
      id: 'subsystem:c',
      kind: 'subsystem',
      title: 'C',
      layer: 'domain',
      status: 'unknown',
      tags: [],
      files: [],
      metadata: {},
    },
  ],
  edges: [
    {
      id: 'a-b-imports',
      from: 'subsystem:a',
      to: 'subsystem:b',
      kind: 'imports',
      category: 'structural',
      source: 'manual',
      confidence: 'high',
      evidenceIds: ['ev-runtime'],
      weight: 1,
      runtimeWeight: 1,
      typeOnlyWeight: 0,
      dynamicWeight: 0,
      metadata: {},
    },
    {
      id: 'a-c-depends',
      from: 'subsystem:a',
      to: 'subsystem:c',
      kind: 'depends_on',
      category: 'structural',
      source: 'manual',
      confidence: 'medium',
      evidenceIds: ['ev-typeonly'],
      weight: 1,
      runtimeWeight: 0,
      typeOnlyWeight: 1,
      dynamicWeight: 0,
      metadata: {},
    },
  ],
  evidence: [
    {
      id: 'ev-runtime',
      sourceKind: 'ast',
      file: 'src/a.ts',
      line: 1,
      detail: 'import',
      confidence: 'high',
      coupling: 'runtime',
    },
    {
      id: 'ev-typeonly',
      sourceKind: 'ast',
      file: 'src/b.ts',
      line: 2,
      detail: 'import type',
      confidence: 'medium',
      coupling: 'type-only',
    },
  ],
  findings: [],
}

const edgeKindLayout: LayoutResult = {
  nodes: [
    { id: 'subsystem:a', x: 100, y: 100 },
    { id: 'subsystem:b', x: 300, y: 100 },
    { id: 'subsystem:c', x: 500, y: 100 },
  ],
  edges: [
    {
      id: 'a-b-imports',
      points: [
        { x: 100, y: 100 },
        { x: 300, y: 100 },
      ],
    },
    {
      id: 'a-c-depends',
      points: [
        { x: 100, y: 100 },
        { x: 500, y: 100 },
      ],
    },
  ],
  width: 600,
  height: 200,
}

describe('GraphCanvas — filter wiring', () => {
  beforeEach(() => {
    useSelectionStore.getState().clear()
    useLayoutStore.getState().reset()
    useFiltersStore.getState().reset()
  })
  afterEach(() => {
    useFiltersStore.getState().reset()
    useLayoutStore.getState().reset()
  })

  // Test 1: showExternal=false (default) — external nodes absent
  it('showExternal=false (default): external node is absent from DOM', () => {
    // Default filter state has showExternal: false
    const { container } = render(
      <GraphCanvas snapshot={externalSnapshot} layout={externalLayout} />,
    )
    const nodeIds = Array.from(container.querySelectorAll('circle')).map((c) =>
      c.getAttribute('data-node-id'),
    )
    expect(nodeIds).toContain('subsystem:s1')
    expect(nodeIds).not.toContain('external:e1')
  })

  // Test 2: showExternal=true — external nodes present
  it('showExternal=true: external node is rendered', () => {
    useFiltersStore.setState({ showExternal: true })
    const { container } = render(
      <GraphCanvas snapshot={externalSnapshot} layout={externalLayout} />,
    )
    const nodeIds = Array.from(container.querySelectorAll('circle')).map((c) =>
      c.getAttribute('data-node-id'),
    )
    expect(nodeIds).toContain('subsystem:s1')
    expect(nodeIds).toContain('external:e1')
  })

  // Test 3: Layer filter — keep only matching layer
  it('layer filter "domain": only domain-layer subsystem is rendered', () => {
    useFiltersStore.setState({ layer: 'domain' })
    const { container } = render(<GraphCanvas snapshot={layerSnapshot} layout={layerLayout} />)
    const nodeIds = Array.from(container.querySelectorAll('circle')).map((c) =>
      c.getAttribute('data-node-id'),
    )
    expect(nodeIds).toContain('subsystem:dom')
    expect(nodeIds).not.toContain('subsystem:horiz')
  })

  // Test 4: Edge kind filter
  it('edgeKind filter "depends_on": only depends_on edges rendered', () => {
    useFiltersStore.setState({ edgeKind: 'depends_on' })
    const { container } = render(
      <GraphCanvas snapshot={edgeKindSnapshot} layout={edgeKindLayout} />,
    )
    const edgeIds = Array.from(container.querySelectorAll('path.vg-edge')).map((p) =>
      p.getAttribute('data-edge-id'),
    )
    expect(edgeIds).toContain('a-c-depends')
    expect(edgeIds).not.toContain('a-b-imports')
  })

  // Test 5: Coupling filter
  it('coupling filter "type-only": only the type-only edge survives', () => {
    useFiltersStore.setState({ coupling: 'type-only' })
    const { container } = render(
      <GraphCanvas snapshot={edgeKindSnapshot} layout={edgeKindLayout} />,
    )
    const edgeIds = Array.from(container.querySelectorAll('path.vg-edge')).map((p) =>
      p.getAttribute('data-edge-id'),
    )
    expect(edgeIds).toContain('a-c-depends')
    expect(edgeIds).not.toContain('a-b-imports')
  })

  // Test 6: Confidence filter
  it('confidence filter "high": only high-confidence edges rendered', () => {
    useFiltersStore.setState({ confidence: 'high' })
    const { container } = render(
      <GraphCanvas snapshot={edgeKindSnapshot} layout={edgeKindLayout} />,
    )
    const edgeIds = Array.from(container.querySelectorAll('path.vg-edge')).map((p) =>
      p.getAttribute('data-edge-id'),
    )
    expect(edgeIds).toContain('a-b-imports')
    expect(edgeIds).not.toContain('a-c-depends')
  })

  // Test 7: Edge with one endpoint filtered out is also removed
  it('edge with one endpoint filtered out by layer is also removed', () => {
    // Filter to domain only: subsystem:horiz is excluded
    // The edge dom→horiz should also be absent
    useFiltersStore.setState({ layer: 'domain' })
    const { container } = render(<GraphCanvas snapshot={layerSnapshot} layout={layerLayout} />)
    const edgeIds = Array.from(container.querySelectorAll('path.vg-edge')).map((p) =>
      p.getAttribute('data-edge-id'),
    )
    // The edge connects dom (kept) → horiz (filtered), so it must be removed
    expect(edgeIds).not.toContain('dom-horiz')
  })

  // Test 8: Reset filters → all back
  it('after reset: all nodes and edges rendered again', () => {
    useFiltersStore.setState({ layer: 'domain' })
    useFiltersStore.getState().reset()
    const { container } = render(<GraphCanvas snapshot={layerSnapshot} layout={layerLayout} />)
    const nodeIds = Array.from(container.querySelectorAll('circle')).map((c) =>
      c.getAttribute('data-node-id'),
    )
    expect(nodeIds).toContain('subsystem:dom')
    expect(nodeIds).toContain('subsystem:horiz')
    const edgeIds = Array.from(container.querySelectorAll('path.vg-edge')).map((p) =>
      p.getAttribute('data-edge-id'),
    )
    expect(edgeIds).toContain('dom-horiz')
  })
})

// ── Suggested node (top fan-in) ───────────────────────────────────────────────

// In baseSnapshot: a→b, b→c → fan-in: a=0, b=1, c=1 → tie b,c → 'subsystem:b' < 'subsystem:c' → b wins
describe('GraphCanvas — suggested node', () => {
  beforeEach(() => {
    useSelectionStore.getState().clear()
    useLayoutStore.getState().reset()
    useFiltersStore.getState().reset()
  })
  afterEach(() => {
    useLayoutStore.getState().reset()
    useFiltersStore.getState().reset()
  })

  it('top fan-in node has data-suggested="true"', () => {
    // baseSnapshot: a→b, b→c. fan-in: b=1, c=1 (tie). 'subsystem:b' < 'subsystem:c' → b suggested.
    const { container } = render(<GraphCanvas snapshot={baseSnapshot} layout={fixedLayout} />)
    const suggestedNodes = container.querySelectorAll('g.vg-node[data-suggested="true"]')
    expect(suggestedNodes).toHaveLength(1)
    expect(suggestedNodes.item(0).getAttribute('data-node-id')).toBe('subsystem:b')
  })

  it('tied fan-in: alphabetical winner gets data-suggested', () => {
    // Both b and c have fan-in=1; 'subsystem:b' < 'subsystem:c' alphabetically
    const { container } = render(<GraphCanvas snapshot={baseSnapshot} layout={fixedLayout} />)
    const nodeB = container.querySelector('g.vg-node[data-node-id="subsystem:b"]')
    const nodeC = container.querySelector('g.vg-node[data-node-id="subsystem:c"]')
    expect(nodeB).toHaveAttribute('data-suggested', 'true')
    expect(nodeC).not.toHaveAttribute('data-suggested')
  })

  it('empty graph (no snapshot) → no data-suggested element', () => {
    const { container } = render(<GraphCanvas />)
    const suggested = container.querySelectorAll('[data-suggested]')
    expect(suggested).toHaveLength(0)
  })

  it('all fan-in=0 graph → no data-suggested element', () => {
    const noEdgesSnapshot: Snapshot = {
      ...baseSnapshot,
      edges: [],
    }
    const noEdgesLayout: LayoutResult = {
      nodes: [
        { id: 'subsystem:a', x: 100, y: 100 },
        { id: 'subsystem:b', x: 300, y: 100 },
        { id: 'subsystem:c', x: 500, y: 100 },
      ],
      edges: [],
      width: 600,
      height: 200,
    }
    const { container } = render(<GraphCanvas snapshot={noEdgesSnapshot} layout={noEdgesLayout} />)
    const suggested = container.querySelectorAll('[data-suggested]')
    expect(suggested).toHaveLength(0)
  })

  it('selection does NOT clear the data-suggested attribute', () => {
    // Select node a — suggested should still be on b (highest fan-in)
    useSelectionStore.getState().setSelectedNode('subsystem:a')
    const { container } = render(<GraphCanvas snapshot={baseSnapshot} layout={fixedLayout} />)
    const suggestedNodes = container.querySelectorAll('g.vg-node[data-suggested="true"]')
    expect(suggestedNodes).toHaveLength(1)
    expect(suggestedNodes.item(0).getAttribute('data-node-id')).toBe('subsystem:b')
    const nodeA = container.querySelector('g.vg-node[data-node-id="subsystem:a"]')
    expect(nodeA).not.toHaveAttribute('data-suggested')
  })
})

// ── MapLegend integration ─────────────────────────────────────────────────────

describe('GraphCanvas — MapLegend integration', () => {
  beforeEach(() => {
    useSelectionStore.getState().clear()
    useLayoutStore.getState().reset()
    useFiltersStore.getState().reset()
  })
  afterEach(() => {
    useLayoutStore.getState().reset()
    useFiltersStore.getState().reset()
  })

  it('renders a .map-legend child inside the graph-canvas svg', () => {
    const { container } = render(<GraphCanvas snapshot={baseSnapshot} layout={fixedLayout} />)
    const svg = container.querySelector('[data-testid="graph-canvas"]')
    expect(svg).not.toBeNull()
    const legend = svg?.querySelector('.map-legend')
    expect(legend).not.toBeNull()
  })

  it('MapLegend is a sibling of .vg-viewport (not nested inside it)', () => {
    const { container } = render(<GraphCanvas snapshot={baseSnapshot} layout={fixedLayout} />)
    const svg = container.querySelector('[data-testid="graph-canvas"]')
    expect(svg).not.toBeNull()
    // Direct children of svg should include both vg-viewport and map-legend
    const directChildren = Array.from(svg?.children ?? [])
    const hasViewport = directChildren.some((el) => el.classList.contains('vg-viewport'))
    const hasLegend = directChildren.some((el) => el.classList.contains('map-legend'))
    expect(hasViewport).toBe(true)
    expect(hasLegend).toBe(true)
  })

  it('MapLegend appears after .vg-viewport in DOM order (renders on top)', () => {
    const { container } = render(<GraphCanvas snapshot={baseSnapshot} layout={fixedLayout} />)
    const svg = container.querySelector('[data-testid="graph-canvas"]')
    expect(svg).not.toBeNull()
    const directChildren = Array.from(svg?.children ?? [])
    const viewportIndex = directChildren.findIndex((el) => el.classList.contains('vg-viewport'))
    const legendIndex = directChildren.findIndex((el) => el.classList.contains('map-legend'))
    expect(viewportIndex).toBeGreaterThanOrEqual(0)
    expect(legendIndex).toBeGreaterThan(viewportIndex)
  })
})

// ── Diff overlay ──────────────────────────────────────────────────────────────

describe('GraphCanvas — diff overlay', () => {
  beforeEach(() => {
    useDiffStore.getState().clear()
    useSelectionStore.getState().clear()
  })
  afterEach(() => {
    useDiffStore.getState().clear()
    useSelectionStore.getState().clear()
  })

  // Seed a delta with an added a→c edge and a blast-delta of +1 on subsystem:b.
  function seedDiff(): void {
    useDiffStore.setState({
      active: true,
      delta: {
        status: 'warn',
        baselineSnapshotId: 'b',
        edges: {
          added: [{ from: 'subsystem:a', to: 'subsystem:c', kind: 'depends_on' }],
          removed: [],
        },
        nodes: { added: [], removed: [] },
        blastRadius: [{ id: 'subsystem:b', before: 0, after: 1, delta: '+1' }],
        violations: { added: [], removed: [] },
        findings: { added: [], removed: [] },
        counts: {
          addedEdges: 1,
          removedEdges: 0,
          newViolations: 0,
          removedViolations: 0,
          newFindings: 0,
          resolvedFindings: 0,
        },
      } as never,
    })
  }

  it('viewport carries data-diff-active="true" when a diff is active', () => {
    seedDiff()
    const { container } = render(<GraphCanvas snapshot={baseSnapshot} layout={fixedLayout} />)
    const viewport = container.querySelector('g.vg-viewport[data-diff-active="true"]')
    expect(viewport).not.toBeNull()
  })

  it('renders an added diff edge (a→c) via DiffEdgesLayer', () => {
    seedDiff()
    const { container } = render(<GraphCanvas snapshot={baseSnapshot} layout={fixedLayout} />)
    const addedEdge = container.querySelector('path.vg-edge[data-diff-kind="added"]')
    expect(addedEdge).not.toBeNull()
    expect(addedEdge).toHaveAttribute('data-diff-edge', 'subsystem:a->subsystem:c')
  })

  it('blast-delta node (subsystem:b) gets data-diff-kind="changed" and a +1 badge', () => {
    seedDiff()
    const { container } = render(<GraphCanvas snapshot={baseSnapshot} layout={fixedLayout} />)
    const nodeB = container.querySelector('g.vg-node[data-node-id="subsystem:b"]')
    expect(nodeB).toHaveAttribute('data-diff-kind', 'changed')
    const badge = nodeB?.querySelector('.vg-diff-badge')
    expect(badge).not.toBeNull()
    expect(badge?.textContent).toBe('+1')
  })

  it('blast radius is suppressed while diff active even with a selected node', async () => {
    seedDiff()
    useSelectionStore.getState().setSelectedNode('subsystem:a')

    const fetcherSpy = vi.fn(async (url: string) => {
      if (url === '/api/snapshot') return baseSnapshot
      if (url.startsWith('/api/blast-radius')) return blastFixture
      throw new Error(`Unexpected URL: ${url}`)
    })

    const { container } = render(
      <SWRConfig value={{ fetcher: fetcherSpy, provider: () => new Map() }}>
        <GraphCanvas snapshot={baseSnapshot} layout={fixedLayout} />
      </SWRConfig>,
    )

    // Give SWR a tick to potentially call the fetcher (mirrors 'when no selection' test)
    await new Promise((r) => setTimeout(r, 50))

    // (a) Strong non-vacuous proof: fetcher was NEVER called for blast-radius while diff active
    expect(
      fetcherSpy.mock.calls.filter(([u]) => (u as string).includes('/api/blast-radius')),
    ).toHaveLength(0)

    // (b) No rendered node <g> carries a data-blast-distance attribute
    const blastNodes = container.querySelectorAll('g.vg-node[data-blast-distance]')
    expect(blastNodes).toHaveLength(0)

    // (c) The blast-dimming viewport attr is absent so it does not fight diff dimming
    const viewport = container.querySelector('g.vg-viewport')
    expect(viewport).not.toHaveAttribute('data-has-selection')
  })
})
