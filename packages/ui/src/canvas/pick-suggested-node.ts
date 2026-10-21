/**
 * Compute the "suggested" node: the visible subsystem node with the highest fan-in
 * (number of incoming edges). Ties are broken alphabetically by id (earlier id wins).
 * If all nodes have fan-in = 0, returns null (no suggestion).
 */
export function pickSuggestedNode(
  nodes: { id: string }[],
  edges: { from: string; to: string }[],
): string | null {
  if (nodes.length === 0) return null

  const fanIn = new Map<string, number>()
  for (const n of nodes) fanIn.set(n.id, 0)
  for (const e of edges) {
    if (fanIn.has(e.to)) {
      fanIn.set(e.to, (fanIn.get(e.to) ?? 0) + 1)
    }
  }

  let bestId: string | null = null
  let bestCount = 0
  for (const [id, count] of fanIn) {
    if (count === 0) continue
    if (bestId === null) {
      bestId = id
      bestCount = count
      continue
    }
    if (count > bestCount) {
      bestId = id
      bestCount = count
    } else if (count === bestCount && id < bestId) {
      bestId = id
    }
  }

  return bestId
}
