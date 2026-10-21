import type React from 'react'
import { formatTimeAgo } from '../utils/format-time-ago.js'

export interface ScanStatusBadgeProps {
  /** ISO timestamp of last scan. */
  builtAt: string | undefined
  /** Optional current time injection for deterministic tests. Defaults to new Date(). */
  now?: Date
}

export function ScanStatusBadge({ builtAt, now }: ScanStatusBadgeProps): React.JSX.Element {
  const label = builtAt === undefined ? 'no scans yet' : formatTimeAgo(builtAt, now)

  return <span className="scan-status-badge">{label}</span>
}
