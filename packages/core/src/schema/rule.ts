import { z } from 'zod'
import { LayerSchema, SeveritySchema } from './common.js'

export const RuleModeSchema = z.enum(['advisory', 'warn', 'enforce']).default('advisory')
export type RuleMode = z.infer<typeof RuleModeSchema>

export const NodeMatcherSchema = z
  .object({
    layer: LayerSchema.optional(),
    subsystem: z.string().optional(),
    exclude_subsystem: z.string().optional(),
  })
  .refine(
    (d) => d.layer !== undefined || d.subsystem !== undefined || d.exclude_subsystem !== undefined,
    { message: 'NodeMatcher must set at least one of layer / subsystem / exclude_subsystem' },
  )
export type NodeMatcher = z.infer<typeof NodeMatcherSchema>

export const RuleSchema = z.discriminatedUnion('kind', [
  z.object({
    kind: z.literal('edge-pattern'),
    id: z.string().min(1),
    title: z.string().min(1),
    severity: SeveritySchema,
    mode: RuleModeSchema,
    from: NodeMatcherSchema,
    to: NodeMatcherSchema,
    relation: z.enum(['imports', 'depends_on', 'calls']).default('depends_on'),
    forbidden: z.boolean().default(true),
    description: z.string().default(''),
  }),
  z.object({
    kind: z.literal('boundary'),
    id: z.string().min(1),
    title: z.string().min(1),
    severity: SeveritySchema,
    mode: RuleModeSchema,
    protectedSubsystem: z.string().min(1),
    allowedFrom: z.array(z.string()).default([]),
    description: z.string().default(''),
  }),
  z.object({
    kind: z.literal('builtin'),
    id: z.string().min(1),
    severity: SeveritySchema,
    mode: RuleModeSchema,
    check: z.enum(['no_cycles', 'no_orphans', 'drift_must_not_worsen']),
    threshold: z.number().int().positive().optional(),
    title: z.string().default(''),
    description: z.string().default(''),
  }),
])
export type Rule = z.infer<typeof RuleSchema>
