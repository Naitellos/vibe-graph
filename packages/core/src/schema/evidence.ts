import { z } from 'zod'
import { ConfidenceSchema, EvidenceCouplingSchema, EvidenceSourceKindSchema } from './common.js'

export const EvidenceSchema = z.object({
  id: z.string().min(1),
  sourceKind: EvidenceSourceKindSchema,
  file: z.string().min(1),
  line: z.number().int().positive().optional(),
  column: z.number().int().positive().optional(),
  symbol: z.string().optional(),
  detail: z.string(),
  confidence: ConfidenceSchema,
  coupling: EvidenceCouplingSchema.default('runtime'),
})

export type Evidence = z.infer<typeof EvidenceSchema>
