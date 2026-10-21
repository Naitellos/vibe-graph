/**
 * Formats an ISO timestamp as a human-readable relative time string.
 *
 * Rules:
 *   diff < 30s        → 'just now'
 *   30s ≤ diff < 60s  → 'Xs ago'  (e.g. '42s ago')
 *   60s ≤ diff < 60m  → 'Xm ago'  (e.g. '2m ago')
 *   60m ≤ diff < 24h  → 'Xh ago'  (e.g. '3h ago')
 *   diff ≥ 24h        → 'Xd ago'  (e.g. '4d ago')
 *
 * Special cases:
 *   - Invalid ISO (NaN) → 'unknown'
 *   - Negative diff (future builtAt / clock skew) → 'just now'
 */
export function formatTimeAgo(builtAt: string, now?: Date): string {
  const builtAtMs = Date.parse(builtAt)
  if (Number.isNaN(builtAtMs)) {
    return 'unknown'
  }

  const nowMs = (now ?? new Date()).getTime()
  const diffMs = nowMs - builtAtMs

  // Negative diff means builtAt is in the future (clock skew)
  if (diffMs < 0) {
    return 'just now'
  }

  const diffSec = Math.floor(diffMs / 1000)

  if (diffSec < 30) {
    return 'just now'
  }

  if (diffSec < 60) {
    return `${diffSec}s ago`
  }

  const diffMin = Math.floor(diffSec / 60)
  if (diffMin < 60) {
    return `${diffMin}m ago`
  }

  const diffHour = Math.floor(diffMin / 60)
  if (diffHour < 24) {
    return `${diffHour}h ago`
  }

  const diffDay = Math.floor(diffHour / 24)
  return `${diffDay}d ago`
}
