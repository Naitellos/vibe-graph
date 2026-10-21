import { scan } from '../scan/scan.js'
import type { Edge } from '../schema/edge.js'
import type { Finding } from '../schema/finding.js'
import type { Node } from '../schema/node.js'

export interface BuildWorkingGraphOptions {
  projectRoot: string
  /** Files that were modified or added. Re-indexed via full re-scan in Plan 1. */
  changedFiles: string[]
  /** Files that were deleted from working tree. Their nodes/edges are pruned. */
  deletedFiles: string[]
}

export interface WorkingGraph {
  nodes: Node[]
  edges: Edge[]
  findings: Finding[]
}

/**
 * Build the working graph reflecting the current state of the project's working tree.
 *
 * Plan 1 implementation: full re-scan (no disk write), then prune any nodes/edges
 * that correspond to files in `deletedFiles`. True incremental re-indexing
 * (only re-parse `changedFiles`) is deferred to v1.x.
 *
 * `changedFiles` is accepted for forward-compat — Plan 1 ignores its content,
 * relying on the working tree being current.
 *
 * Note: scan() does not write to disk by design; the CLI/MCP layer is responsible
 * for persistence. buildWorkingGraph is therefore inherently in-memory only.
 */
export async function buildWorkingGraph(opts: BuildWorkingGraphOptions): Promise<WorkingGraph> {
  const snapshot = await scan({ root: opts.projectRoot })

  const deletedFileIds = new Set(opts.deletedFiles.map((f) => `file:${f}`))
  if (deletedFileIds.size === 0) {
    return {
      nodes: snapshot.nodes,
      edges: snapshot.edges,
      findings: snapshot.findings,
    }
  }

  const keptNodes = snapshot.nodes.filter((n) => !deletedFileIds.has(n.id))
  const keptEdges = snapshot.edges.filter(
    (e) => !deletedFileIds.has(e.from) && !deletedFileIds.has(e.to),
  )

  return {
    nodes: keptNodes,
    edges: keptEdges,
    findings: snapshot.findings,
  }
}
