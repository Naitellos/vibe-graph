/**
 * Estimate token count for a set of text parts.
 *
 * Uses a simple character-count / 4 heuristic — a fast first-order estimate
 * suitable for budget checks before calling a real tokenizer. Exact token
 * counts are model-specific; this is intentionally approximate.
 *
 * @param parts - Named text parts; values may be a string or array of strings.
 * @returns Estimated token count (Math.round of total chars / 4).
 */
export function estimateTokens(parts: Record<string, string | string[]>): number {
  let total = 0
  for (const v of Object.values(parts)) {
    if (Array.isArray(v)) {
      for (const s of v) total += s.length
    } else {
      total += v.length
    }
  }
  return Math.round(total / 4)
}
