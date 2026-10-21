import type { FindingDomain } from '@codearch/core'
import type React from 'react'
import './DomainTabs.css'

export interface DomainTabsProps {
  activeDomain: FindingDomain | 'all'
  onSelect: (domain: FindingDomain | 'all') => void
}

type TabDef = { label: string; value: FindingDomain | 'all' }

const TABS: TabDef[] = [
  { label: 'All', value: 'all' },
  { label: 'Architecture', value: 'architecture' },
  { label: 'Security', value: 'security' },
  { label: 'Drift', value: 'drift' },
  { label: 'Rule violations', value: 'rule' },
  { label: 'Tests', value: 'tests' },
]

export function DomainTabs({ activeDomain, onSelect }: DomainTabsProps): React.JSX.Element {
  return (
    <div role="tablist" className="domain-tabs">
      {TABS.map(({ label, value }) => {
        const isActive = activeDomain === value
        return (
          <button
            key={value}
            type="button"
            data-active={isActive ? 'true' : undefined}
            aria-pressed={isActive ? 'true' : 'false'}
            onClick={() => onSelect(value)}
          >
            {label}
          </button>
        )
      })}
    </div>
  )
}
