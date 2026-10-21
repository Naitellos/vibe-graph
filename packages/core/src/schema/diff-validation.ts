import { z } from 'zod'
import { EdgeSchema } from './edge.js'
import { FindingSchema } from './finding.js'
import { NodeSchema } from './node.js'

export const ValidateDiffModeSchema = z.enum(['advisory', 'warn', 'enforce'])
export type ValidateDiffMode = z.infer<typeof ValidateDiffModeSchema>

export const ValidateDiffInputSchema = z.object({
  taskId: z.string().optional(),
  diff: z.string().optional(),
  workingFiles: z.array(z.string()).optional(),
  mode: ValidateDiffModeSchema.default('advisory'),
})
export type ValidateDiffInput = z.infer<typeof ValidateDiffInputSchema>

export const ValidateDiffStatusSchema = z.enum(['ok', 'warn', 'violation'])

const GraphDeltaSchema = z.object({
  newEdges: z.array(EdgeSchema),
  removedEdges: z.array(EdgeSchema),
  newNodes: z.array(NodeSchema),
  removedNodes: z.array(NodeSchema),
})

const GraphDeltaCountsSchema = z.object({
  newEdges: z.number().int().nonnegative(),
  removedEdges: z.number().int().nonnegative(),
  newNodes: z.number().int().nonnegative(),
  removedNodes: z.number().int().nonnegative(),
})

const ValidateDiffScopeSchema = z.object({
  taskLinked: z.boolean(),
  plannedFiles: z.array(z.string()),
  changedFiles: z.array(z.string()),
  deletedFiles: z.array(z.string()),
  outOfScopeFiles: z.array(z.string()),
  omittedGraphDelta: GraphDeltaCountsSchema,
})

const RiskDeltaSchema = z.object({
  blastRadius: z.record(
    z.string(),
    z.object({ before: z.number(), after: z.number(), delta: z.string() }),
  ),
})

export const ConformanceSchema = z.object({
  headline: z.string(),
  byKind: z.object({
    cycles: z.number().int().nonnegative(),
    coupling: z.number().int().nonnegative(),
    boundaries: z.number().int().nonnegative(),
    orphans: z.number().int().nonnegative(),
  }),
})
export type Conformance = z.infer<typeof ConformanceSchema>

export const ValidateDiffOutputSchema = z.object({
  taskId: z.string().optional(),
  status: ValidateDiffStatusSchema,
  summary: z.string(),
  newViolations: z.array(FindingSchema),
  removedViolations: z.array(FindingSchema),
  newFindings: z.array(FindingSchema),
  removedFindings: z.array(FindingSchema),
  graphDelta: GraphDeltaSchema,
  scope: ValidateDiffScopeSchema,
  riskDelta: RiskDeltaSchema,
  recommendations: z.array(z.string()),
  missingTests: z.array(z.string()),
  baselineSnapshotId: z.string(),
  conformance: ConformanceSchema.optional(),
})
export type ValidateDiffOutput = z.infer<typeof ValidateDiffOutputSchema>
