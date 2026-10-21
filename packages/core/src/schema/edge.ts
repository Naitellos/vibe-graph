import { z } from 'zod'
import { ConfidenceSchema, EdgeCategorySchema, EdgeKindSchema, EdgeSourceSchema } from './common.js'

export const EdgeSchema = z.object({
  id: z.string().min(1),
  from: z.string().min(1),
  to: z.string().min(1),
  kind: EdgeKindSchema,
  category: EdgeCategorySchema.default('structural'),
  source: EdgeSourceSchema,
  confidence: ConfidenceSchema,
  evidenceIds: z.array(z.string()).default([]),
  weight: z.number().int().positive().default(1),
  runtimeWeight: z.number().int().nonnegative().default(0),
  typeOnlyWeight: z.number().int().nonnegative().default(0),
  dynamicWeight: z.number().int().nonnegative().default(0),
  metadata: z.record(z.string(), z.unknown()).default({}),
})

export type Edge = z.infer<typeof EdgeSchema>
