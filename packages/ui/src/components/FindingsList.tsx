import type { Finding, FindingDomain } from '@codearch/core'
import { useState } from 'react'
import type React from 'react'
import { useSelectionStore } from '../state/selection.js'
import { useSnapshot } from '../state/snapshot.js'
import { sortFindings } from '../utils/sort-findings.js'
import { DomainTabs } from './DomainTabs.js'
import { FindingCard } from './FindingCard.js'

export function FindingsList(): React.JSX.Element {
  const { data } = useSnapshot()
  const selectedFindingId = useSelectionStore((s) => s.selectedFindingId)
  const [activeDomain, setActiveDomain] = useState<FindingDomain | 'all'>('all')
  const [showAccepted, setShowAccepted] = useState(false)

  if (data === undefined) {
    return <div>Loading findings…</div>
  }

  const allFindings: Finding[] = data.findings ?? []
  const filtered = allFindings.filter((f) => {
    // Domain filter
    if (activeDomain !== 'all' && f.domain !== activeDomain) {
      return false
    }

    // Status filter: when viewing drift domain, hide accepted/ignored unless showAccepted is true
    if (activeDomain === 'drift' && !showAccepted) {
      if (f.status === 'accepted' || f.status === 'ignored') {
        return false
      }
    }

    return true
  })

  const sorted = sortFindings(filtered)

  // Count accepted/ignored drift findings for "Show accepted" label
  const hiddenAcceptedCount = allFindings.filter(
    (f) => f.domain === 'drift' && (f.status === 'accepted' || f.status === 'ignored'),
  ).length

  return (
    <div>
      <DomainTabs activeDomain={activeDomain} onSelect={setActiveDomain} />
      {activeDomain === 'drift' ? (
        <button
          type="button"
          onClick={() => setShowAccepted((prev) => !prev)}
          aria-pressed={showAccepted ? 'true' : 'false'}
        >
          {showAccepted ? 'Hide accepted' : `Show accepted (${hiddenAcceptedCount})`}
        </button>
      ) : null}
      {sorted.length === 0 ? (
        <div>No findings yet (detector coming soon)</div>
      ) : (
        sorted.map((f) => (
          <FindingCard key={f.id} finding={f} selected={selectedFindingId === f.id} />
        ))
      )}
    </div>
  )
}
