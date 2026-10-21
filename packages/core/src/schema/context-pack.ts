import { z } from 'zod'
import { ConfidenceSchema, EdgeKindSchema } from './common.js'

export const ContextRelationshipSchema = z.object({
  from: z.string().min(1),
  to: z.string().min(1),
  kind: EdgeKindSchema,
  confidence: ConfidenceSchema,
  evidenceCount: z.number().int().nonnegative(),
})
export type ContextRelationship = z.infer<typeof ContextRelationshipSchema>

const ContextFactSchema = z.object({
  kind: z.string(),
  text: z.string(),
  nodeIds: z.array(z.string()).default([]),
})

const ContextCriticalFileSchema = z.object({
  path: z.string(),
  role: z.string(),
  excerpt: z.string().optional(),
})

const RedactionsSchema = z
  .object({
    totalCount: z.number().int().nonnegative(),
    byKind: z.record(z.string(), z.number().int().nonnegative()),
  })
  .optional()

export const ContextPackSchema = z.object({
  id: z.string().min(1),
  target: z.string().min(1),
  tokenBudget: z.number().int().positive(),
  estimatedTokens: z.number().int().nonnegative(),
  tokenEstimateMethod: z.literal('char-div-4'),
  summary: z.string(),
  facts: z.array(ContextFactSchema),
  criticalFiles: z.array(ContextCriticalFileSchema),
  relationships: z.array(ContextRelationshipSchema),
  blastRadius: z.array(z.string()),
  recommendations: z.array(z.string()).default([]),
  tests: z.array(z.string()).default([]),
  doNotDo: z.array(z.string()).default([]),
  metadata: z.object({ redactions: RedactionsSchema }).default({}),
})

export type ContextPack = z.infer<typeof ContextPackSchema>
