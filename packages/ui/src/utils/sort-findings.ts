import type { Finding } from '@codearch/core'

const SEVERITY_RANK: Record<Finding['severity'], number> = { high: 3, medium: 2, low: 1 }

export function sortFindings(findings: Finding[]): Finding[] {
  return [...findings].sort((a, b) => {
    const sevDiff = SEVERITY_RANK[b.severity] - SEVERITY_RANK[a.severity]
    if (sevDiff !== 0) return sevDiff
    const countDiff = b.involvedNodeIds.length - a.involvedNodeIds.length
    if (countDiff !== 0) return countDiff
    return a.id.localeCompare(b.id)
  })
}
