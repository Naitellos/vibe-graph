import { z } from 'zod'
import { EdgeSchema } from './edge.js'
import { FindingSchema } from './finding.js'
import { NodeSchema } from './node.js'

/**
 * Atomic full-graph baseline snapshot. Written by `vibe-graph baseline` command,
 * read by `validate_diff` MCP tool to compute graph deltas.
 *
 * Distinct from `.vibegraph/drift-baseline.json` (which only stores
 * accept/ignore status per drift finding id).
 */
export const GraphBaselineSchema = z.object({
  schemaVersion: z.literal('1.0').default('1.0'),
  snapshotId: z.string().min(1),
  createdAt: z.iso.datetime(),
  fingerprint: z.string().min(1),
  nodes: z.array(NodeSchema),
  edges: z.array(EdgeSchema),
  findings: z.array(FindingSchema),
})

export type GraphBaseline = z.infer<typeof GraphBaselineSchema>
