import { z } from 'zod'
import { LayerSchema, StatusSchema } from './common.js'

const DateString = z.string().regex(/^\d{4}-\d{2}-\d{2}$/, {
  message: 'last_verified must be YYYY-MM-DD',
})

export const SubsystemDocSchema = z.object({
  id: z.string().min(1),
  title: z.string().min(1),
  layer: LayerSchema,
  status: StatusSchema.default('unknown'),
  description: z.string().default(''),
  last_verified: DateString.optional(),
  verified_by: z.string().optional(),
  match: z.union([z.string(), z.array(z.string())]).transform((v) => (Array.isArray(v) ? v : [v])),
  depends_on: z.array(z.string()).default([]),
  consumed_by: z.array(z.string()).default([]),
  schema_tables: z.array(z.string()).default([]),
  related_specs: z.array(z.string()).default([]),
  related_decisions: z.array(z.string()).default([]),
  memory_refs: z.array(z.string()).default([]),
})

export type SubsystemDoc = z.infer<typeof SubsystemDocSchema>
