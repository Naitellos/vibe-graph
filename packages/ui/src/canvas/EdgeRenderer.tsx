import type React from 'react'
import type { LayoutEdge } from './graph-layout.js'

export interface EdgeRendererProps {
  edge: LayoutEdge
  /** Whether this edge connects two focused nodes. */
  focused?: boolean
  /** Diff state for the diff overlay (added/removed). */
  diffKind?: 'added' | 'removed'
  onMouseEnter?: (id: string) => void
  onMouseLeave?: () => void
}

/**
 * Converts an array of points into an SVG path `d` attribute string.
 * Format: `M x0 y0 L x1 y1 L x2 y2 ...`
 */
export function pathFromPoints(points: { x: number; y: number }[]): string {
  if (points.length === 0) return ''
  const [first, ...rest] = points
  if (!first) return ''
  const start = `M ${first.x} ${first.y}`
  const segments = rest.map((p) => `L ${p.x} ${p.y}`)
  return [start, ...segments].join(' ')
}

export function EdgeRenderer({
  edge,
  focused,
  diffKind,
  onMouseEnter,
  onMouseLeave,
}: EdgeRendererProps): React.JSX.Element {
  return (
    <path
      className="vg-edge"
      data-edge-id={edge.id}
      d={pathFromPoints(edge.points)}
      data-focused={focused ? 'true' : undefined}
      data-diff-kind={diffKind ?? undefined}
      onMouseEnter={onMouseEnter ? () => onMouseEnter(edge.id) : undefined}
      onMouseLeave={onMouseLeave}
    />
  )
}
