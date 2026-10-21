import type { Node } from '../schema/node.js'
import type { LoadedSnapshot } from '../snapshot/load-snapshot.js'

export type TargetResolutionErrorCode = 'NOT_FOUND' | 'AMBIGUOUS'

export interface TargetResolutionError {
  error: TargetResolutionErrorCode
  /** For NOT_FOUND: fuzzy suggestions (top 3 by edit distance). For AMBIGUOUS: candidate node ids. */
  candidates: string[]
}

export type ResolveTargetResult = Node | TargetResolutionError

// ── Internal helpers ───────────────────────────────────────────────────────────

/**
 * Normalize a user-supplied file path to match the `file:<relpath>` id format
 * used by the indexer. Strips leading `./` and normalizes backslashes to forward
 * slashes for Windows compat.
 */
function normalizePath(p: string): string {
  return p.replace(/^\.\//, '').replaceAll('\\', '/')
}

/**
 * Compute the Levenshtein edit distance between two strings.
 * Uses the 2-row optimized form to minimize allocations.
 */
function levenshtein(a: string, b: string): number {
  if (a === b) return 0
  const m = a.length
  const n = b.length
  if (m === 0) return n
  if (n === 0) return m

  const prev: number[] = Array.from({ length: n + 1 }, (_, i) => i)
  const curr: number[] = new Array(n + 1)

  for (let i = 1; i <= m; i++) {
    curr[0] = i
    for (let j = 1; j <= n; j++) {
      const cost = a[i - 1] === b[j - 1] ? 0 : 1
      curr[j] = Math.min((prev[j] ?? 0) + 1, (curr[j - 1] ?? 0) + 1, (prev[j - 1] ?? 0) + cost)
    }
    for (let j = 0; j <= n; j++) prev[j] = curr[j] ?? 0
  }

  return prev[n] ?? 0
}

/**
 * Return the top-N candidates from `candidates` sorted by ascending edit
 * distance to `query`. Comparison is case-insensitive.
 */
function topNFuzzy(query: string, candidates: string[], n: number): string[] {
  const q = query.toLowerCase()
  return candidates
    .map((c) => ({ c, dist: levenshtein(q, c.toLowerCase()) }))
    .sort((x, y) => x.dist - y.dist)
    .slice(0, n)
    .map((x) => x.c)
}

// ── Public API ─────────────────────────────────────────────────────────────────

/**
 * Resolve a user-supplied `query` string to a Node in `snap` using a 5-step
 * cascade (see §6.3 of the design spec):
 *
 * 1. Exact node id
 * 2. Exact relative file path (e.g. `./src/foo.ts` → `file:src/foo.ts`)
 * 3. Kind-prefixed shorthand: tries `subsystem:<query>`, `package:<query>`,
 *    `external:<query>` in that order
 * 4. Unique case-insensitive title match — returns AMBIGUOUS if multiple nodes
 *    share the same title
 * 5. Fuzzy fallback — returns NOT_FOUND with the top-3 closest node ids
 */
export function resolveTarget(snap: LoadedSnapshot, query: string): ResolveTargetResult {
  // Step 1: exact node id
  const exactNode = snap.nodesById.get(query)
  if (exactNode !== undefined) return exactNode

  // Step 2: exact relative file path
  const fileNodeId = `file:${normalizePath(query)}`
  const fileNode = snap.nodesById.get(fileNodeId)
  if (fileNode !== undefined) return fileNode

  // Step 3: kind:slug shorthand
  for (const kind of ['subsystem', 'package', 'external']) {
    const id = `${kind}:${query}`
    const kindNode = snap.nodesById.get(id)
    if (kindNode !== undefined) return kindNode
  }

  // Step 4: unique title match (case-insensitive)
  const lowerQuery = query.toLowerCase()
  const titleMatches = [...snap.nodesById.values()].filter(
    (n) => n.title.toLowerCase() === lowerQuery,
  )

  if (titleMatches.length === 1 && titleMatches[0] !== undefined) return titleMatches[0]
  if (titleMatches.length > 1) {
    return {
      error: 'AMBIGUOUS',
      candidates: titleMatches.map((n) => n.id),
    }
  }

  // Step 5: fuzzy suggestions (top 3)
  return {
    error: 'NOT_FOUND',
    candidates: topNFuzzy(query, [...snap.nodesById.keys()], 3),
  }
}
