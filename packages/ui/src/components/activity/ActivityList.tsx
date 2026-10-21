import type { ActivityEntry as Entry } from '@codearch/core'
import type React from 'react'
import { useState } from 'react'
import { ActivityEntry } from './ActivityEntry.js'

const RENDER_CAP = 200

export interface ActivityListProps {
  entries: Entry[]
}

export function ActivityList({ entries }: ActivityListProps): React.JSX.Element {
  const [showAll, setShowAll] = useState(false)
  if (entries.length === 0) {
    return <p style={{ padding: 12, opacity: 0.6, fontSize: 13 }}>No activity yet.</p>
  }
  const ordered = [...entries].reverse() // newest first
  const visible = showAll ? ordered : ordered.slice(0, RENDER_CAP)
  return (
    <div data-testid="activity-list" style={{ overflow: 'auto', height: '100%' }}>
      {visible.map((e) => (
        <ActivityEntry key={e.id} entry={e} />
      ))}
      {!showAll && entries.length > RENDER_CAP ? (
        <div style={{ padding: 12, textAlign: 'center', fontSize: 12, opacity: 0.7 }}>
          Showing {RENDER_CAP} of {entries.length} total.{' '}
          <button type="button" onClick={() => setShowAll(true)}>
            Show all
          </button>
        </div>
      ) : null}
    </div>
  )
}
