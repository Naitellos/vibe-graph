import { z } from 'zod'
import { SeveritySchema } from './common.js'

export const PrepareTaskModeSchema = z.enum(['refactor', 'feature', 'bugfix'])
export type PrepareTaskMode = z.infer<typeof PrepareTaskModeSchema>

export const PrepareTaskInputSchema = z.object({
  intent: z.string().min(1).describe('Natural-language description of the change'),
  paths: z.array(z.string().min(1)).min(1).describe('Files the agent plans to edit'),
  mode: PrepareTaskModeSchema.default('refactor'),
})
export type PrepareTaskInput = z.infer<typeof PrepareTaskInputSchema>

const RiskSchema = z.object({
  severity: SeveritySchema,
  title: z.string(),
  involvedNodeIds: z.array(z.string()),
})

const RuleSummarySchema = z.object({
  id: z.string(),
  title: z.string(),
  severity: SeveritySchema,
  mode: z.enum(['advisory', 'warn', 'enforce']),
})

const RequiredContextSchema = z.object({
  files: z.array(z.string()).default([]),
  schemaTables: z.array(z.string()).default([]),
  relatedAdrs: z.array(z.string()).default([]),
})

export const PrepareTaskOutputSchema = z.object({
  taskId: z.string(),
  createdAt: z.iso.datetime(),
  target: z.object({
    subsystems: z.array(z.string()),
    files: z.array(z.string()),
  }),
  summary: z.string(),
  risks: z.array(RiskSchema),
  rules: z.array(RuleSummarySchema),
  doNotDo: z.array(z.string()),
  requiredContext: RequiredContextSchema,
  recommendations: z.array(z.string()),
  tests: z.array(z.string()),
  baselineSnapshotId: z.string(),
})
export type PrepareTaskOutput = z.infer<typeof PrepareTaskOutputSchema>

export const TaskSessionSchema = z.object({
  taskId: z.string(),
  intent: z.string(),
  paths: z.array(z.string()),
  mode: PrepareTaskModeSchema,
  baselineSnapshotId: z.string(),
  createdAt: z.iso.datetime(),
})
export type TaskSession = z.infer<typeof TaskSessionSchema>
