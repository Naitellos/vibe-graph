import { z } from 'zod'
import { LayerSchema, NodeKindSchema, StatusSchema } from './common.js'

export const NodeSchema = z.object({
  id: z.string().min(1),
  kind: NodeKindSchema,
  title: z.string().min(1),
  layer: LayerSchema.default('unknown'),
  status: StatusSchema.default('unknown'),
  tags: z.array(z.string()).default([]),
  files: z.array(z.string()).default([]),
  metadata: z.record(z.string(), z.unknown()).default({}),
})

export type Node = z.infer<typeof NodeSchema>
