/**
 * Stage 3 merge logic: combine outputs from multiple analyzers into a single
 * deduplicated graph.
 *
 * Key invariants:
 *  - Nodes are merged by `id`. Same id + same kind → union fields.
 *    Same id + different kind → NODE_KIND_CONFLICT error.
 *  - Edges are merged by the composite key `from|to|kind|source`.
 *    The `|` separator is chosen because node ids contain `:` but not `|`.
 *    `ast` and `manual` edges share from/to/kind but differ on `source`, so
 *    they remain separate — they are independent confirmations.
 *  - Evidence is concat-only (ids are analyzer-scoped and unique by construction).
 */

import type { Confidence } from '../schema/common.js'
import type { Edge } from '../schema/edge.js'
import type { Evidence } from '../schema/evidence.js'
import type { Node } from '../schema/node.js'

// ─── Error types ─────────────────────────────────────────────────────────────

export type ScanErrorCode = 'NODE_KIND_CONFLICT' | 'EDGE_CATEGORY_CONFLICT'

export class ScanError extends Error {
  constructor(
    public readonly code: ScanErrorCode,
    message: string,
    public readonly details: {
      nodeId?: string
      edgeId?: string
      analyzerIds?: string[]
      [k: string]: unknown
    },
  ) {
    super(message)
    this.name = 'ScanError'
  }
}

// ─── Public interfaces ────────────────────────────────────────────────────────

export interface AnalyzerOutput {
  analyzerId: string
  nodes: readonly Node[]
  edges: readonly Edge[]
  evidence: readonly Evidence[]
}

export interface MergeResult {
  nodes: Node[]
  edges: Edge[]
  evidence: Evidence[]
}

// ─── Helpers ─────────────────────────────────────────────────────────────────

/**
 * Worst-confidence comparator.
 *
 * IMPORTANT: "worst" here means LOWEST quality, i.e. `low` is worse than
 * `medium` which is worse than `high`. The ranking is therefore:
 *   high = 0 (best), medium = 1, low = 2 (worst)
 *
 * We always keep the higher rank value (= worse quality).
 */
function worstConfidence(a: Confidence, b: Confidence): Confidence {
  const rank: Record<Confidence, number> = { high: 0, medium: 1, low: 2 }
  return rank[a] >= rank[b] ? a : b
}

/**
 * Returns a union of two arrays with stable order: existing items first, then
 * new items that weren't already present (preserves insertion order, no dups).
 */
function unionArray<T>(existing: T[], incoming: T[]): T[] {
  const set = new Set(existing)
  const result = [...existing]
  for (const item of incoming) {
    if (!set.has(item)) {
      set.add(item)
      result.push(item)
    }
  }
  return result
}

/**
 * Merge edge category under "structural = default / no opinion" semantics.
 *
 * Rules:
 *  - Both structural → structural.
 *  - One structural, one explicit → use the explicit (structural = "no opinion").
 *  - Both same explicit value → keep that value.
 *  - Both explicit but different → EDGE_CATEGORY_CONFLICT.
 */
function mergeCategory(
  existing: Edge['category'],
  incoming: Edge['category'],
  edgeKey: string,
  existingAnalyzerId: string,
  incomingAnalyzerId: string,
): Edge['category'] {
  if (existing === incoming) return existing

  if (existing === 'structural') return incoming
  if (incoming === 'structural') return existing

  // Both non-structural and different → conflict
  throw new ScanError(
    'EDGE_CATEGORY_CONFLICT',
    `Edge ${edgeKey} has conflicting categories: '${existing}' (from ${existingAnalyzerId}) vs '${incoming}' (from ${incomingAnalyzerId})`,
    {
      edgeId: edgeKey,
      analyzerIds: [existingAnalyzerId, incomingAnalyzerId],
      categories: [existing, incoming],
    },
  )
}

// ─── Main merge function ──────────────────────────────────────────────────────

export function mergeAnalyzerOutputs(outputs: readonly AnalyzerOutput[]): MergeResult {
  type NodeEntry = { node: Node; sourceAnalyzers: string[] }
  type EdgeEntry = { edge: Edge; sourceAnalyzers: string[] }

  const nodesById = new Map<string, NodeEntry>()
  const edgesByKey = new Map<string, EdgeEntry>()
  const allEvidence: Evidence[] = []

  for (const output of outputs) {
    const { analyzerId } = output

    // ── Merge nodes ───────────────────────────────────────────────────────
    for (const incoming of output.nodes) {
      const existing = nodesById.get(incoming.id)

      if (existing === undefined) {
        nodesById.set(incoming.id, {
          node: { ...incoming },
          sourceAnalyzers: [analyzerId],
        })
        continue
      }

      if (existing.node.kind !== incoming.kind) {
        throw new ScanError(
          'NODE_KIND_CONFLICT',
          `Node ${incoming.id} declared as both '${existing.node.kind}' and '${incoming.kind}'`,
          {
            nodeId: incoming.id,
            analyzerIds: [...existing.sourceAnalyzers, analyzerId],
            kinds: [existing.node.kind, incoming.kind],
          },
        )
      }

      // Same kind → merge fields
      const merged = existing.node

      // title: first-wins (keep existing)

      // layer: first-wins UNLESS existing is 'unknown' — prefer non-unknown
      if (merged.layer === 'unknown' && incoming.layer !== 'unknown') {
        merged.layer = incoming.layer
      }

      // status: same rule as layer
      if (merged.status === 'unknown' && incoming.status !== 'unknown') {
        merged.status = incoming.status
      }

      // tags: union, dedupe
      merged.tags = unionArray(merged.tags, incoming.tags)

      // files: union, dedupe
      merged.files = unionArray(merged.files, incoming.files)

      // metadata: shallow merge (later overrides on key collision)
      merged.metadata = { ...merged.metadata, ...incoming.metadata }

      existing.sourceAnalyzers.push(analyzerId)
    }

    // ── Merge edges ───────────────────────────────────────────────────────
    for (const incoming of output.edges) {
      // Composite key — node ids can contain `:` but not `|`, so `|` is safe.
      const key = `${incoming.from}|${incoming.to}|${incoming.kind}|${incoming.source}`
      const existing = edgesByKey.get(key)

      if (existing === undefined) {
        edgesByKey.set(key, {
          edge: { ...incoming },
          sourceAnalyzers: [analyzerId],
        })
        continue
      }

      const merged = existing.edge
      const existingAnalyzerId = existing.sourceAnalyzers[0] ?? '<unknown>'

      // weight fields: sum
      merged.weight += incoming.weight
      merged.runtimeWeight += incoming.runtimeWeight
      merged.typeOnlyWeight += incoming.typeOnlyWeight
      merged.dynamicWeight += incoming.dynamicWeight

      // evidenceIds: union preserving order, no duplicates
      merged.evidenceIds = unionArray(merged.evidenceIds, incoming.evidenceIds)

      // confidence: worst (lowest quality)
      merged.confidence = worstConfidence(merged.confidence, incoming.confidence)

      // category: first-wins with structural-as-default logic (may throw)
      merged.category = mergeCategory(
        merged.category,
        incoming.category,
        key,
        existingAnalyzerId,
        analyzerId,
      )

      // metadata: shallow merge (later overrides on key collision)
      merged.metadata = { ...merged.metadata, ...incoming.metadata }

      existing.sourceAnalyzers.push(analyzerId)
    }

    // ── Collect evidence ──────────────────────────────────────────────────
    for (const ev of output.evidence) {
      allEvidence.push(ev)
    }
  }

  return {
    nodes: Array.from(nodesById.values()).map((e) => e.node),
    edges: Array.from(edgesByKey.values()).map((e) => e.edge),
    evidence: allEvidence,
  }
}
