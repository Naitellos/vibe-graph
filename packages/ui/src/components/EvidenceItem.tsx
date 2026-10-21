import type React from 'react'
import { useEvidence } from '../state/snapshot.js'

export interface EvidenceItemProps {
  evidenceId: string
}

export function EvidenceItem({ evidenceId }: EvidenceItemProps): React.JSX.Element {
  const { data: evidence, isLoading } = useEvidence(evidenceId)

  if (isLoading || evidence === undefined) {
    return <div data-testid="evidence-item-loading">Loading {evidenceId}…</div>
  }

  const location = evidence.line !== undefined ? `${evidence.file}:${evidence.line}` : evidence.file

  return (
    <div data-testid="evidence-item" data-evidence-id={evidenceId}>
      <span>{location}</span>
      <dl>
        <dt>Source</dt>
        <dd>{evidence.sourceKind}</dd>
        <dt>Coupling</dt>
        <dd>{evidence.coupling}</dd>
        <dt>Confidence</dt>
        <dd>{evidence.confidence}</dd>
        {evidence.detail !== undefined && evidence.detail !== '' && (
          <>
            <dt>Detail</dt>
            <dd>{evidence.detail}</dd>
          </>
        )}
      </dl>
    </div>
  )
}
