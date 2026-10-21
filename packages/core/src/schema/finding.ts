import { z } from 'zod'
import { FindingDomainSchema, FindingStatusSchema, SeveritySchema } from './common.js'

const KnownFindingType = z.enum(['cycle', 'high-fan-out', 'high-fan-in', 'orphan'])

export const FindingSchema = z.object({
  id: z.string().min(1),
  domain: FindingDomainSchema,
  type: z.union([KnownFindingType, z.string()]),
  detectorId: z.string().min(1),
  severity: SeveritySchema,
  title: z.string().min(1),
  summary: z.string(),
  involvedNodeIds: z.array(z.string()),
  evidenceIds: z.array(z.string()).default([]),
  status: FindingStatusSchema.default('open'),
  metadata: z.record(z.string(), z.unknown()).default({}),
})

export type Finding = z.infer<typeof FindingSchema>
