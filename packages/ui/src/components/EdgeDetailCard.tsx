import type React from 'react'
import { useSelectionStore } from '../state/selection.js'
import { useSnapshot } from '../state/snapshot.js'

export function EdgeDetailCard(): React.JSX.Element {
  const selectedEdgeId = useSelectionStore((s) => s.selectedEdgeId)
  const setSelectedNode = useSelectionStore((s) => s.setSelectedNode)

  const { data: snapshot, isLoading } = useSnapshot()

  if (isLoading || snapshot === undefined) {
    return <div data-testid="edge-detail-loading">Loading…</div>
  }

  const edge = snapshot.edges.find((e) => e.id === selectedEdgeId)

  if (edge === undefined) {
    return <div data-testid="edge-detail-card">Edge not found</div>
  }

  const evidenceMap = new Map(snapshot.evidence.map((ev) => [ev.id, ev]))
  const evidenceItems = edge.evidenceIds
    .map((id) => evidenceMap.get(id))
    .filter((ev) => ev !== undefined)

  return (
    <div data-testid="edge-detail-card">
      <h3>
        <button
          type="button"
          onClick={() => {
            setSelectedNode(edge.from)
          }}
        >
          {edge.from}
        </button>
        {' → '}
        <button
          type="button"
          onClick={() => {
            setSelectedNode(edge.to)
          }}
        >
          {edge.to}
        </button>
      </h3>

      <dl>
        <dt>Kind</dt>
        <dd>{edge.kind}</dd>
        <dt>Source</dt>
        <dd>{edge.source}</dd>
        <dt>Confidence</dt>
        <dd>{edge.confidence}</dd>
      </dl>

      {evidenceItems.length > 0 && (
        <section>
          <h4>Evidence</h4>
          <ul>
            {evidenceItems.map((ev) => (
              <li key={ev.id}>{ev.line !== undefined ? `${ev.file}:${ev.line}` : ev.file}</li>
            ))}
          </ul>
        </section>
      )}
    </div>
  )
}
