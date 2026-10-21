import type React from 'react'
import { useEffect } from 'react'
import { useActivityLogStore } from '../state/activity-log.js'
import { ActivityList } from './activity/ActivityList.js'

export function ActivityLog(): React.JSX.Element {
  const entries = useActivityLogStore((s) => s.entries)
  const isLoading = useActivityLogStore((s) => s.isLoading)

  useEffect(() => {
    void useActivityLogStore.getState().loadInitial()
  }, [])

  const last = entries.at(-1) ?? null // .at(-1) ?? null → Entry | null (satisfies noUncheckedIndexedAccess)

  return (
    <div
      data-testid="activity-log-root"
      style={{
        display: 'flex',
        flexDirection: 'column',
        height: '100%',
        width: '100%',
        maxWidth: 1100,
        margin: '0 auto',
      }}
    >
      <header
        style={{
          padding: '8px 12px',
          borderBottom: '1px solid var(--border, #2c2a44)',
          fontSize: 12,
          opacity: 0.8,
        }}
      >
        {isLoading && entries.length === 0 ? (
          'Loading…'
        ) : (
          <>
            {entries.length} entr{entries.length === 1 ? 'y' : 'ies'}
            {last !== null ? ` · last: ${last.tool}` : ''}
          </>
        )}
      </header>
      <ActivityList entries={entries} />
    </div>
  )
}
