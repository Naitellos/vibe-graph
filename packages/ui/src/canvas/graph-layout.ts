import * as dagre from 'dagre'

export interface LayoutNode {
  id: string
  x: number
  y: number
}

export interface LayoutEdge {
  id: string
  points: { x: number; y: number }[]
}

export interface LayoutResult {
  nodes: LayoutNode[]
  edges: LayoutEdge[]
  width: number
  height: number
}

export interface LayoutInput {
  /** Node ids the layout should position. */
  nodes: { id: string }[]
  /** Directed edges: from depends on to. */
  edges: { id: string; from: string; to: string }[]
  /** Optional knobs. */
  options?: {
    gapX?: number // horizontal spacing between ranks (default 220)
    gapY?: number // vertical spacing within a rank (default 95)
    nodeW?: number // node width (default 150) — affects edge endpoint placement
    nodeH?: number // node height (default 64)
  }
}

export function computeGraphLayout(input: LayoutInput): LayoutResult {
  const gapX = input.options?.gapX ?? 220
  const gapY = input.options?.gapY ?? 95
  const nodeW = input.options?.nodeW ?? 150
  const nodeH = input.options?.nodeH ?? 64

  // Clone and sort for determinism
  const nodes = input.nodes.slice().sort((a, b) => a.id.localeCompare(b.id))
  const edges = input.edges
    .slice()
    .sort(
      (a, b) =>
        a.from.localeCompare(b.from) || a.to.localeCompare(b.to) || a.id.localeCompare(b.id),
    )

  // Build a side-map (from,to) → edge id for re-emitting ids after dagre layout.
  // multigraph: false — callers must not pass duplicate (from,to) pairs; last writer wins in edgeKeyToId.
  const edgeKeyToId = new Map<string, string>()
  for (const e of edges) {
    edgeKeyToId.set(`${e.from}\0${e.to}`, e.id)
  }

  const g = new dagre.graphlib.Graph({ multigraph: false, directed: true })

  g.setGraph({
    rankdir: 'LR',
    nodesep: gapY,
    ranksep: gapX,
    marginx: nodeW / 2,
    marginy: nodeH / 2,
    acyclicer: 'greedy',
    ranker: 'longest-path',
  })

  g.setDefaultEdgeLabel(() => ({}))
  g.setDefaultNodeLabel(() => ({}))

  for (const node of nodes) {
    g.setNode(node.id, { width: nodeW, height: nodeH, label: node.id })
  }

  for (const edge of edges) {
    // Skip self-loops — dagre handles them poorly and they're not meaningful for layout
    if (edge.from === edge.to) continue
    g.setEdge(edge.from, edge.to, { weight: 1 })
  }

  dagre.layout(g)

  // Extract node positions
  const resultNodes: LayoutNode[] = []
  for (const node of nodes) {
    const n = g.node(node.id) as dagre.Node
    resultNodes.push({ id: node.id, x: n.x, y: n.y })
  }

  // Extract edge points — re-attach the original edge ids via our side-map
  const resultEdges: LayoutEdge[] = []
  for (const dagreEdge of g.edges()) {
    const key = `${dagreEdge.v}\0${dagreEdge.w}`
    const id = edgeKeyToId.get(key)
    if (id === undefined) continue // defensive — should not happen
    const edgeData = g.edge(dagreEdge) as dagre.GraphEdge
    const points = edgeData.points ?? []
    resultEdges.push({ id, points })
  }

  const graphAttrs = g.graph()
  // dagre returns -Infinity for width/height when the graph has no nodes;
  // clamp to 0 so the SVG viewBox stays valid.
  const rawWidth = graphAttrs.width ?? 0
  const rawHeight = graphAttrs.height ?? 0
  const width = Number.isFinite(rawWidth) ? rawWidth : 0
  const height = Number.isFinite(rawHeight) ? rawHeight : 0

  return {
    nodes: resultNodes,
    edges: resultEdges,
    width,
    height,
  }
}
