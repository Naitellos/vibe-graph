import type React from 'react'

export interface EvidenceBadgeProps {
  /** Position to anchor the badge (SVG coords). */
  x: number
  y: number
  /** Evidence items to display (already trimmed by caller). */
  items: { file: string; line?: number }[]
}

const LINE_HEIGHT = 14
const PADDING_X = 6
const PADDING_Y = 5
const FONT_SIZE = 10
const OFFSET_Y = 8 // vertical offset from the anchor point

export function EvidenceBadge({ x, y, items }: EvidenceBadgeProps): React.JSX.Element {
  // Estimate rect width based on longest label
  const labels = items.map((item) =>
    item.line !== undefined ? `${item.file}:${item.line}` : item.file,
  )
  const maxChars = Math.max(...labels.map((l) => l.length), 1)
  const rectW = maxChars * (FONT_SIZE * 0.6) + PADDING_X * 2
  const rectH = items.length * LINE_HEIGHT + PADDING_Y * 2

  const rectX = x - rectW / 2
  const rectY = y + OFFSET_Y

  return (
    <g className="evidence-badge" style={{ pointerEvents: 'none' }}>
      <rect x={rectX} y={rectY} width={rectW} height={rectH} rx={3} ry={3} />
      {labels.map((label, i) => (
        <text
          // biome-ignore lint/suspicious/noArrayIndexKey: static list, no reordering
          key={i}
          x={rectX + PADDING_X}
          y={rectY + PADDING_Y + FONT_SIZE + i * LINE_HEIGHT}
        >
          {label}
        </text>
      ))}
    </g>
  )
}
