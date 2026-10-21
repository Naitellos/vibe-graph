import type React from 'react'
import type { DiffSets } from './delta-to-diff-sets.js'

export interface DiffEdgesLayerProps {
  sets: DiffSets
  positions: Map<string, { x: number; y: number }>
}

export function DiffEdgesLayer({ sets, positions }: DiffEdgesLayerProps): React.JSX.Element {
  const line = (from: string, to: string) => {
    const a = positions.get(from)
    const b = positions.get(to)
    if (a === undefined || b === undefined) return null
    return `M ${a.x} ${a.y} L ${b.x} ${b.y}`
  }
  return (
    <g className="vg-diff-edges">
      {sets.addedEdges.map((e) => {
        const d = line(e.from, e.to)
        return d === null ? null : (
          <path
            key={`a:${e.from}->${e.to}`}
            className="vg-edge"
            data-diff-kind="added"
            data-diff-edge={`${e.from}->${e.to}`}
            d={d}
          />
        )
      })}
      {sets.removedEdges.map((e) => {
        const d = line(e.from, e.to)
        return d === null ? null : (
          <path
            key={`r:${e.from}->${e.to}`}
            className="vg-edge"
            data-diff-kind="removed"
            data-diff-edge={`${e.from}->${e.to}`}
            d={d}
          />
        )
      })}
    </g>
  )
}
