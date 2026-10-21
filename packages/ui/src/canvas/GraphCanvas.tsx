import type { Snapshot } from '@codearch/core'
import type React from 'react'
import { useCallback, useMemo, useState } from 'react'
import { useDiffStore } from '../state/diff.js'
import { useFiltersStore } from '../state/filters.js'
import { useLayoutStore } from '../state/layout.js'
import { useSelectionStore } from '../state/selection.js'
import { useBlastRadius, useSnapshot } from '../state/snapshot.js'
import { DiffEdgesLayer } from './DiffEdgesLayer.js'
import { EdgeRenderer } from './EdgeRenderer.js'
import { EvidenceBadge } from './EvidenceBadge.js'
import { deltaToDiffSets, nodeDiffKind } from './delta-to-diff-sets.js'
import './GraphCanvas.css'
import { MapLegend } from './MapLegend.js'
import { NodeRenderer } from './NodeRenderer.js'
import { edgeMidpoint } from './edge-midpoint.js'
import { type LayoutResult, computeGraphLayout } from './graph-layout.js'
import { pickSuggestedNode } from './pick-suggested-node.js'
import { usePanZoom } from './use-pan-zoom.js'

export interface GraphCanvasProps {
  /** Optional snapshot override (defaults to useSnapshot()). Provided for tests. */
  snapshot?: Snapshot
  /** Optional preset layout (defaults to computing via graph-layout). For tests. */
  layout?: LayoutResult
}

export function GraphCanvas(props?: GraphCanvasProps): React.JSX.Element {
  const swrResult = useSnapshot()
  const snapshot = props?.snapshot ?? swrResult.data

  const selectedNodeId = useSelectionStore((s) => s.selectedNodeId)
  const hoveredNodeId = useSelectionStore((s) => s.hoveredNodeId)
  const setSelectedNode = useSelectionStore((s) => s.setSelectedNode)
  const setHoveredNode = useSelectionStore((s) => s.setHoveredNode)

  const focusMode = useLayoutStore((s) => s.focusMode)
  const toggleFocusMode = useLayoutStore((s) => s.toggleFocusMode)

  const filterLayer = useFiltersStore((s) => s.layer)
  const filterEdgeKind = useFiltersStore((s) => s.edgeKind)
  const filterCoupling = useFiltersStore((s) => s.coupling)
  const filterConfidence = useFiltersStore((s) => s.confidence)
  const filterShowExternal = useFiltersStore((s) => s.showExternal)

  const diffActive = useDiffStore((s) => s.active)
  const diffDelta = useDiffStore((s) => s.delta)

  // Suppress the blast-radius fetch while a diff is active — the diff overlay
  // owns node emphasis in that mode and the blast dimming would fight it.
  const { data: blastRadiusData } = useBlastRadius(diffActive ? null : selectedNodeId)

  // Build a Map<nodeId, distance> from the blast radius result.
  // selectedNodeId itself = 0, direct = 1, transitive = 2, cycles = 3.
  const blastDistanceMap = useMemo<Map<string, number>>(() => {
    const map = new Map<string, number>()
    if (diffActive || selectedNodeId === null || blastRadiusData === undefined) return map
    map.set(selectedNodeId, 0)
    for (const id of blastRadiusData.direct) map.set(id, 1)
    for (const id of blastRadiusData.transitive) map.set(id, 2)
    for (const id of blastRadiusData.cycles) map.set(id, 3)
    return map
  }, [diffActive, selectedNodeId, blastRadiusData])

  const [hoveredEdgeId, setHoveredEdgeId] = useState<string | null>(null)

  const handleEdgeMouseEnter = useCallback((id: string) => setHoveredEdgeId(id), [])
  const handleEdgeMouseLeave = useCallback(() => setHoveredEdgeId(null), [])

  const handleSvgClick = useCallback(
    (e: React.MouseEvent<SVGSVGElement>) => {
      // Clear selection for any click NOT inside a node element.
      if ((e.target as Element).closest('.vg-node') === null) {
        setSelectedNode(null)
      }
    },
    [setSelectedNode],
  )

  const handleSvgKeyDown = useCallback(
    (e: React.KeyboardEvent<SVGSVGElement>) => {
      if (e.key === 'Escape') setSelectedNode(null)
      if (e.key === 'f') toggleFocusMode()
    },
    [setSelectedNode, toggleFocusMode],
  )

  const onNodeMouseLeave = useCallback(() => setHoveredNode(null), [setHoveredNode])

  // Derive subsystem edges for focus computation (also used in render path below).
  // Must be computed before any early return to keep hooks order stable.
  const subsystemEdges = useMemo(() => {
    if (snapshot === undefined) return []
    const subsystemIds = new Set(
      snapshot.nodes.filter((n) => n.kind === 'subsystem').map((n) => n.id),
    )
    return snapshot.edges.filter((e) => subsystemIds.has(e.from) && subsystemIds.has(e.to))
  }, [snapshot])

  // Compute focus set: selected node + all direct neighbors (any direction)
  const focusedNodeIds = useMemo<Set<string>>(() => {
    if (!focusMode || selectedNodeId === null) return new Set()
    const ids = new Set<string>([selectedNodeId])
    for (const edge of subsystemEdges) {
      if (edge.from === selectedNodeId) ids.add(edge.to)
      if (edge.to === selectedNodeId) ids.add(edge.from)
    }
    return ids
  }, [focusMode, selectedNodeId, subsystemEdges])

  // Focused edges: both endpoints are in the focused set
  const focusedEdgeIds = useMemo<Set<string>>(() => {
    if (!focusMode || selectedNodeId === null) return new Set()
    const ids = new Set<string>()
    for (const edge of subsystemEdges) {
      if (focusedNodeIds.has(edge.from) && focusedNodeIds.has(edge.to)) {
        ids.add(edge.id)
      }
    }
    return ids
  }, [focusMode, selectedNodeId, subsystemEdges, focusedNodeIds])

  // Compute the suggested node (top fan-in among visible subsystem nodes, alphabetical tiebreak).
  // Must be before early return to satisfy rules of hooks.
  const suggestedNodeId = useMemo(() => {
    if (snapshot === undefined) return null
    const subsystemNodes = snapshot.nodes.filter((n) => n.kind === 'subsystem')
    const subsystemIds = new Set(subsystemNodes.map((n) => n.id))
    const subsEdges = snapshot.edges.filter(
      (e) => subsystemIds.has(e.from) && subsystemIds.has(e.to),
    )
    return pickSuggestedNode(
      subsystemNodes.map((n) => ({ id: n.id })),
      subsEdges.map((e) => ({ from: e.from, to: e.to })),
    )
  }, [snapshot])

  // Build evidence lookup by id (evidence is an array in Snapshot).
  // Must be before early return to satisfy rules of hooks.
  const evidenceById = useMemo(
    () => new Map((snapshot?.evidence ?? []).map((ev) => [ev.id, ev])),
    [snapshot],
  )

  // Filter nodes/edges and compute layout. Memoized BEFORE the early return so
  // the hooks order stays stable and so usePanZoom can fit to the graph bounds.
  const derived = useMemo(() => {
    if (snapshot === undefined) return null

    // --- Node filtering ---
    // Kind filter: subsystem always included; external only when showExternal=true
    const kindFilteredNodes = snapshot.nodes.filter(
      (n) => n.kind === 'subsystem' || (filterShowExternal && n.kind === 'external'),
    )
    // Apply layer filter on top of kind filter
    const visibleNodes =
      filterLayer === 'all'
        ? kindFilteredNodes
        : kindFilteredNodes.filter((n) => n.layer === filterLayer)
    const visibleNodeIds = new Set(visibleNodes.map((n) => n.id))

    // --- Edge filtering ---
    const visibleEdges = snapshot.edges.filter((e) => {
      // Both endpoints must be visible nodes
      if (!visibleNodeIds.has(e.from) || !visibleNodeIds.has(e.to)) return false
      // Edge kind filter
      if (filterEdgeKind !== 'all' && e.kind !== filterEdgeKind) return false
      // Confidence filter
      if (filterConfidence !== 'all' && e.confidence !== filterConfidence) return false
      // Coupling filter: at least one evidence item must match
      if (filterCoupling !== 'all') {
        const hasMatchingCoupling = e.evidenceIds.some((evId) => {
          const ev = evidenceById.get(evId)
          return ev !== undefined && ev.coupling === filterCoupling
        })
        if (!hasMatchingCoupling) return false
      }
      return true
    })

    // Compute layout if not provided — use filtered nodes/edges
    const layout =
      props?.layout ??
      computeGraphLayout({
        nodes: visibleNodes.map((n) => ({ id: n.id })),
        edges: visibleEdges.map((e) => ({ id: e.id, from: e.from, to: e.to })),
      })

    // When using a preset layout (test prop), restrict rendered items to visible set
    const visibleEdgeIds = new Set(visibleEdges.map((e) => e.id))
    const layoutNodesToRender = layout.nodes.filter((n) => visibleNodeIds.has(n.id))
    const layoutEdgesToRender = layout.edges.filter((e) => visibleEdgeIds.has(e.id))
    const nodeMetaById = new Map(visibleNodes.map((n) => [n.id, n]))

    return { layout, layoutNodesToRender, layoutEdgesToRender, nodeMetaById }
  }, [
    snapshot,
    filterLayer,
    filterEdgeKind,
    filterCoupling,
    filterConfidence,
    filterShowExternal,
    evidenceById,
    props?.layout,
  ])

  // Fit the graph to the viewport using its laid-out bounds.
  const { svgRef, transform } = usePanZoom(
    derived === null ? undefined : { width: derived.layout.width, height: derived.layout.height },
  )

  // Derive the diff overlay sets from the active delta, scoped to nodes that are
  // actually rendered (so we never draw a diff edge to a filtered-out node).
  const diffSets = useMemo(() => {
    if (!diffActive || diffDelta === null || derived === null) return null
    const present = new Set(derived.layoutNodesToRender.map((n) => n.id))
    return deltaToDiffSets(diffDelta, present)
  }, [diffActive, diffDelta, derived])

  if (snapshot === undefined || derived === null) {
    return <svg ref={svgRef} data-testid="graph-canvas" className="vg-canvas" />
  }

  const { layoutNodesToRender, layoutEdgesToRender, nodeMetaById } = derived

  return (
    // biome-ignore lint/a11y/noSvgWithoutTitle: interactive canvas — title provided via aria-label on parent container
    <svg
      ref={svgRef}
      data-testid="graph-canvas"
      className="vg-canvas"
      aria-label="Dependency graph"
      onClick={handleSvgClick}
      onKeyDown={handleSvgKeyDown}
    >
      <g
        className="vg-viewport"
        transform={transform}
        data-has-selection={!diffActive && selectedNodeId !== null ? 'true' : undefined}
        data-focus-mode={focusMode ? 'true' : undefined}
        data-diff-active={diffActive ? 'true' : undefined}
      >
        <g className="vg-edges">
          {layoutEdgesToRender.map((edge) => (
            <EdgeRenderer
              key={edge.id}
              edge={edge}
              focused={focusedEdgeIds.has(edge.id)}
              onMouseEnter={handleEdgeMouseEnter}
              onMouseLeave={handleEdgeMouseLeave}
            />
          ))}
        </g>
        {diffSets ? (
          <DiffEdgesLayer
            sets={diffSets}
            positions={new Map(layoutNodesToRender.map((n) => [n.id, { x: n.x, y: n.y }]))}
          />
        ) : null}
        <g className="vg-nodes">
          {layoutNodesToRender.map((node) => {
            const meta = nodeMetaById.get(node.id)
            return (
              <NodeRenderer
                key={node.id}
                node={node}
                meta={{
                  id: node.id,
                  kind: meta?.kind,
                  layer: meta?.layer,
                }}
                selected={selectedNodeId === node.id}
                hovered={hoveredNodeId === node.id}
                blastDistance={blastDistanceMap.get(node.id)}
                focused={focusedNodeIds.has(node.id)}
                suggested={suggestedNodeId === node.id}
                diffKind={diffSets ? nodeDiffKind(node.id, diffSets) : undefined}
                blastBadge={diffSets?.blastBadges.get(node.id)}
                onClick={setSelectedNode}
                onMouseEnter={setHoveredNode}
                onMouseLeave={onNodeMouseLeave}
              />
            )
          })}
        </g>
        {(() => {
          if (hoveredEdgeId === null) return null
          const hoveredLayoutEdge = layoutEdgesToRender.find((le) => le.id === hoveredEdgeId)
          if (hoveredLayoutEdge === undefined) return null
          const snapshotEdge = snapshot.edges.find((e) => e.id === hoveredEdgeId)
          if (snapshotEdge === undefined) return null
          const evidenceItems = snapshotEdge.evidenceIds
            .slice(0, 3)
            .map((evId) => evidenceById.get(evId))
            .filter((ev): ev is NonNullable<typeof ev> => ev !== undefined)
            .map((ev) => ({ file: ev.file, line: ev.line }))
          if (evidenceItems.length === 0) return null
          const mid = edgeMidpoint(hoveredLayoutEdge.points)
          return <EvidenceBadge x={mid.x} y={mid.y} items={evidenceItems} />
        })()}
      </g>
      <MapLegend />
    </svg>
  )
}
