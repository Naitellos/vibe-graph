import type { Finding } from '@codearch/core'
import { useState } from 'react'
import { useSelectionStore } from '../state/selection.js'
import './FindingCard.css'

export interface FindingCardProps {
  finding: Finding
  selected: boolean
}

const SEVERITY_COLOR: Record<Finding['severity'], string> = {
  high: 'var(--accent-danger)',
  medium: 'var(--accent-warning)',
  low: 'var(--accent-info)',
}

export function FindingCard({ finding, selected }: FindingCardProps): React.JSX.Element {
  const { id, severity, domain, title, involvedNodeIds, status: initialStatus } = finding
  const [localStatus, setLocalStatus] = useState<Finding['status']>(initialStatus)

  function select(): void {
    useSelectionStore.getState().setSelectedFinding(id)
  }

  async function handleSetStatus(newStatus: 'accepted' | 'ignored'): Promise<void> {
    setLocalStatus(newStatus)
    try {
      // NOTE: do NOT encodeURIComponent — backend matches via prefix+slice on raw
      // pathname (`req.pathname.startsWith('/api/findings/')`), so encoded colons
      // would become a literal `%3A` substring in the parsed id and never match
      // `f.id` in the snapshot. Colons are valid in URL path segments per RFC 3986.
      const res = await fetch(`/api/findings/${id}/status`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ status: newStatus }),
      })
      if (!res.ok) {
        setLocalStatus(initialStatus)
      }
    } catch {
      setLocalStatus(initialStatus)
    }
  }

  return (
    <article
      className="finding-card"
      data-finding-id={id}
      data-selected={selected ? 'true' : undefined}
    >
      <button
        type="button"
        className="finding-card__main"
        aria-label={`${severity} ${domain}: ${title}`}
        onClick={select}
      >
        <span className="finding-card__title">{title}</span>
        <span className="finding-card__meta">
          <span className="finding-card__severity" style={{ color: SEVERITY_COLOR[severity] }}>
            {severity}
          </span>
          {domain === 'rule' && typeof finding.metadata?.ruleId === 'string' ? (
            <span className="finding-card__rule" data-testid="rule-id-badge">
              [{finding.metadata.ruleId as string}]
            </span>
          ) : null}
          <span className="finding-card__nodes">{involvedNodeIds.length} nodes</span>
          <span className="finding-card__status">{localStatus}</span>
        </span>
      </button>
      <div className="actions">
        <button
          type="button"
          onClick={() => {
            handleSetStatus('accepted')
          }}
        >
          Accept
        </button>
        <button
          type="button"
          onClick={() => {
            handleSetStatus('ignored')
          }}
        >
          Ignore
        </button>
      </div>
    </article>
  )
}
