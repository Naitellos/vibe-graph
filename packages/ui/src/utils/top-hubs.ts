/**
 * Computes top N subsystem nodes by fan-in (number of incoming edges).
 * Ties are broken alphabetically by id (earlier id wins).
 */
export function topHubsByFanIn(
  nodes: { id: string; kind?: string }[],
  edges: { from: string; to: string }[],
  limit = 5,
): { id: string; fanIn: number }[] {
  // Filter to subsystem nodes only
  const subsystems = nodes.filter((n) => n.kind === 'subsystem')
  if (subsystems.length === 0) return []

  const fanIn = new Map<string, number>()
  for (const n of subsystems) fanIn.set(n.id, 0)

  for (const e of edges) {
    if (fanIn.has(e.to)) {
      fanIn.set(e.to, (fanIn.get(e.to) ?? 0) + 1)
    }
  }

  const entries = Array.from(fanIn.entries()).map(([id, count]) => ({ id, fanIn: count }))

  // Sort by fan-in descending, then id ascending as tiebreak
  entries.sort((a, b) => {
    if (b.fanIn !== a.fanIn) return b.fanIn - a.fanIn
    return a.id < b.id ? -1 : a.id > b.id ? 1 : 0
  })

  return entries.slice(0, limit)
}
