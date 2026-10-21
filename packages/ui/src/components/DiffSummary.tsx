import type React from 'react'
import { useDiffStore } from '../state/diff.js'
import './DiffSummary.css'

export function DiffSummary(): React.JSX.Element | null {
  const active = useDiffStore((s) => s.active)
  const delta = useDiffStore((s) => s.delta)

  if (!active || delta === null) return null

  const {
    addedEdges,
    removedEdges,
    newViolations,
    removedViolations,
    newFindings,
    resolvedFindings,
  } = delta.counts
  // Node add/remove counts aren't in `counts`; derive them so a node-only diff
  // isn't mistaken for "no changes".
  const addedNodes = delta.nodes.added.length
  const removedNodes = delta.nodes.removed.length
  // Blast-radius changes: entries where the dep-count shifted.
  const blastChanges = delta.blastRadius.filter((b) => b.delta !== '0').length
  const hasChanges =
    addedEdges !== 0 ||
    removedEdges !== 0 ||
    addedNodes !== 0 ||
    removedNodes !== 0 ||
    newViolations !== 0 ||
    removedViolations !== 0 ||
    newFindings !== 0 ||
    resolvedFindings !== 0 ||
    blastChanges !== 0

  return (
    <div data-testid="diff-summary" className="diff-summary">
      {delta.headline ? (
        <span className="diff-summary__headline" data-testid="diff-summary-headline">
          {delta.headline}
        </span>
      ) : null}
      <span className={`diff-summary__status diff-summary__status--${delta.status}`}>
        {delta.status}
      </span>
      <div className="diff-summary__counts">
        {hasChanges ? (
          <>
            <span>
              +{addedEdges} / −{removedEdges} edges
            </span>
            {addedNodes !== 0 || removedNodes !== 0 ? (
              <span>
                +{addedNodes} / −{removedNodes} subsystems
              </span>
            ) : null}
            <span>
              {newViolations} new / {removedViolations} resolved violations
            </span>
            <span>
              {newFindings} new / {resolvedFindings} resolved findings
            </span>
            {blastChanges > 0 ? <span>{blastChanges} blast Δ</span> : null}
          </>
        ) : (
          <span className="diff-summary__no-changes">No graph changes</span>
        )}
      </div>
      <div className="diff-summary__clear">
        <button type="button" className="vg-button" onClick={() => useDiffStore.getState().clear()}>
          Clear diff
        </button>
      </div>
    </div>
  )
}
