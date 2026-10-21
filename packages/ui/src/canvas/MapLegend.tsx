import type React from 'react'

/** Severity row definition */
interface SeverityRow {
  label: string
  swatchClass: string
}

/** Coupling row definition */
interface CouplingRow {
  label: string
  swatchClass: string
}

const SEVERITY_ROWS: SeverityRow[] = [
  { label: 'High', swatchClass: 'swatch-severity-high' },
  { label: 'Medium', swatchClass: 'swatch-severity-medium' },
  { label: 'Low', swatchClass: 'swatch-severity-low' },
]

const COUPLING_ROWS: CouplingRow[] = [
  { label: 'Runtime', swatchClass: 'swatch-coupling-runtime' },
  { label: 'Type-only', swatchClass: 'swatch-coupling-type-only' },
  { label: 'Dynamic', swatchClass: 'swatch-coupling-dynamic' },
  { label: 'Re-export', swatchClass: 'swatch-coupling-reexport' },
]

const SWATCH_R = 4
const ROW_HEIGHT = 14
const PADDING = 8
const LABEL_OFFSET_X = 14
const SECTION_LABEL_OFFSET_Y = 2
const BG_WIDTH = 100
const BG_HEIGHT =
  PADDING +
  14 + // title
  4 + // gap before Severity
  12 + // "Severity" section label
  SEVERITY_ROWS.length * ROW_HEIGHT +
  6 + // gap before Coupling
  12 + // "Coupling" section label
  COUPLING_ROWS.length * ROW_HEIGHT +
  PADDING

/**
 * MapLegend — in-canvas SVG overlay.
 *
 * Rendered as a direct child of the GraphCanvas <svg>, OUTSIDE .vg-viewport,
 * so it stays fixed and does not pan/zoom with the graph.
 *
 * Position: translate(16, 16) — top-left corner.
 * pointer-events: none — does not intercept graph interactions.
 */
export function MapLegend(): React.JSX.Element {
  let cursorY = PADDING

  // Title
  const titleY = cursorY + 11
  cursorY += 14

  // Severity section
  cursorY += 4 // gap
  const severitySectionY = cursorY + SECTION_LABEL_OFFSET_Y + 9
  cursorY += 12

  const severityRowsStart = cursorY

  // Coupling section
  const couplingGapStart = severityRowsStart + SEVERITY_ROWS.length * ROW_HEIGHT
  const couplingSectionY = couplingGapStart + 6 + SECTION_LABEL_OFFSET_Y + 9
  const couplingRowsStart = couplingGapStart + 6 + 12

  return (
    <g className="map-legend" transform="translate(16, 16)" style={{ pointerEvents: 'none' }}>
      {/* Background */}
      <rect className="bg" x={0} y={0} width={BG_WIDTH} height={BG_HEIGHT} rx={4} />

      {/* Title */}
      <text className="title" x={PADDING} y={titleY}>
        Legend
      </text>

      {/* Severity section label */}
      <text className="section-label" x={PADDING} y={severitySectionY}>
        Severity
      </text>

      {/* Severity rows */}
      {SEVERITY_ROWS.map((row, i) => {
        const y = severityRowsStart + i * ROW_HEIGHT + ROW_HEIGHT / 2
        return (
          <g
            key={row.label}
            className={`legend-row legend-row-severity-${row.label.toLowerCase()}`}
          >
            <rect
              className={row.swatchClass}
              x={PADDING}
              y={y - SWATCH_R}
              width={SWATCH_R * 2}
              height={SWATCH_R * 2}
              rx={1}
            />
            <text x={PADDING + LABEL_OFFSET_X} y={y + 4}>
              {row.label}
            </text>
          </g>
        )
      })}

      {/* Coupling section label */}
      <text className="section-label" x={PADDING} y={couplingSectionY}>
        Coupling
      </text>

      {/* Coupling rows */}
      {COUPLING_ROWS.map((row, i) => {
        const y = couplingRowsStart + i * ROW_HEIGHT + ROW_HEIGHT / 2
        return (
          <g
            key={row.label}
            className={`legend-row legend-row-coupling-${row.label.toLowerCase()}`}
          >
            <rect
              className={row.swatchClass}
              x={PADDING}
              y={y - SWATCH_R}
              width={SWATCH_R * 2}
              height={SWATCH_R * 2}
              rx={1}
            />
            <text x={PADDING + LABEL_OFFSET_X} y={y + 4}>
              {row.label}
            </text>
          </g>
        )
      })}
    </g>
  )
}
