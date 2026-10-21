import type { Layer, NodeKind } from '@codearch/core'
import type React from 'react'
import type { LayoutNode } from './graph-layout.js'

export interface NodeRendererProps {
  node: LayoutNode
  /** The original Snapshot node, for kind/layer-aware styling. */
  meta: { id: string; kind?: NodeKind; layer?: Layer }
  selected?: boolean
  hovered?: boolean
  /** Distance from the selected node in the blast radius (0 = self, 1 = direct, 2+ = transitive). */
  blastDistance?: number
  /** Whether this node is in the current focus set (selected node + direct neighbors). */
  focused?: boolean
  /** Whether this node is the first-load suggested starting point (top fan-in). */
  suggested?: boolean
  /** Diff state for the diff overlay (added/changed/violation). */
  diffKind?: 'added' | 'changed' | 'violation'
  /** Badge text shown near the node in diff mode (e.g. "+2" for blast-delta). */
  blastBadge?: string
  onClick?: (id: string) => void
  onMouseEnter?: (id: string) => void
  onMouseLeave?: (id: string) => void
}

const MAX_LABEL_LEN = 12

// Radius chosen to match the layout's nodeH=64/2 default minus stroke breathing room.
// Bumped to 42 (1.5x of 28) in Plan C §5.4 for readable labels at default viewport.
const NODE_RADIUS = 42
// Vertical offset to optically center 11px text inside the circle (≈ half cap-height).
const TEXT_BASELINE_OFFSET = 4

export function NodeRenderer({
  node,
  meta,
  selected,
  hovered,
  blastDistance,
  focused,
  suggested,
  diffKind,
  blastBadge,
  onClick,
  onMouseEnter,
  onMouseLeave,
}: NodeRendererProps): React.JSX.Element {
  const suffix = node.id.split(':').pop() ?? node.id
  const label = suffix.length > MAX_LABEL_LEN ? suffix.slice(0, MAX_LABEL_LEN) : suffix

  return (
    <g
      className="vg-node"
      data-node-id={node.id}
      data-layer={meta.layer ?? 'unknown'}
      data-selected={selected ? 'true' : undefined}
      data-hovered={hovered ? 'true' : undefined}
      data-blast-distance={blastDistance !== undefined ? String(blastDistance) : undefined}
      data-focused={focused ? 'true' : undefined}
      data-suggested={suggested ? 'true' : undefined}
      data-diff-kind={diffKind ?? undefined}
    >
      <circle
        cx={node.x}
        cy={node.y}
        r={NODE_RADIUS}
        data-node-id={node.id}
        tabIndex={0}
        role="button"
        aria-label={label}
        aria-pressed={selected}
        onClick={() => onClick?.(node.id)}
        onKeyDown={(e) => {
          if (e.key === 'Enter' || e.key === ' ') onClick?.(node.id)
        }}
        onMouseEnter={() => onMouseEnter?.(node.id)}
        onMouseLeave={() => onMouseLeave?.(node.id)}
      />
      <text x={node.x} y={node.y + TEXT_BASELINE_OFFSET} textAnchor="middle" pointerEvents="none">
        {label}
      </text>
      {blastBadge ? (
        <text className="vg-diff-badge" x={node.x + NODE_RADIUS} y={node.y - NODE_RADIUS}>
          {blastBadge}
        </text>
      ) : null}
    </g>
  )
}
