import type React from 'react'
import { useSelectionStore } from '../state/selection.js'
import { useSnapshot } from '../state/snapshot.js'
import { EvidenceItem } from './EvidenceItem.js'

export function EvidenceView(): React.JSX.Element {
  const selectedNodeId = useSelectionStore((s) => s.selectedNodeId)
  const selectedEdgeId = useSelectionStore((s) => s.selectedEdgeId)
  const { data: snapshot } = useSnapshot()

  let evidenceIds: string[] = []

  if (snapshot !== undefined) {
    if (selectedEdgeId !== null) {
      const edge = snapshot.edges.find((e) => e.id === selectedEdgeId)
      evidenceIds = edge?.evidenceIds ?? []
    } else if (selectedNodeId !== null) {
      const seen = new Set<string>()
      for (const edge of snapshot.edges) {
        if (edge.from === selectedNodeId || edge.to === selectedNodeId) {
          for (const id of edge.evidenceIds) {
            seen.add(id)
          }
        }
      }
      evidenceIds = Array.from(seen)
    }
  }

  return (
    <div data-testid="evidence-view">
      <h4>Evidence ({evidenceIds.length} items)</h4>
      {evidenceIds.length === 0 ? (
        <div>No evidence for this selection.</div>
      ) : (
        <ul>
          {evidenceIds.map((id) => (
            <li key={id}>
              <EvidenceItem evidenceId={id} />
            </li>
          ))}
        </ul>
      )}
    </div>
  )
}
