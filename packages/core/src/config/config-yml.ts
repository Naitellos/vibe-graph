import { existsSync } from 'node:fs'
import { readFile } from 'node:fs/promises'
import { join } from 'node:path'
import { parse as parseYaml } from 'yaml'
import { z } from 'zod'
import { DEFAULT_BUILTIN_RULES } from '../rules/builtin/index.js'
import { LayerSchema } from '../schema/common.js'
import { type Rule, RuleSchema } from '../schema/rule.js'
import type { SubsystemDoc } from '../schema/subsystem-doc.js'
import { loadSubsystemDocs } from './subsystems-loader.js'

export const ConfigSchema = z.object({
  project: z
    .object({
      name: z.string().optional(),
      root: z.string().default('.'),
    })
    .default({ root: '.' }),
  subsystemDetection: z
    .object({
      mode: z.enum(['auto', 'manual', 'hybrid']).default('auto'),
      /**
       * How deep auto-detection goes in a workspace repo.
       *
       * `package` (default) — one subsystem per workspace package.
       * `feature` — descend one level and treat each top-level directory of a
       *   package's source root as its own subsystem.
       *
       * Why this exists: on a two-app monorepo (`apps/backend` + `apps/frontend`)
       * package granularity yields exactly two subsystems that never import each
       * other, so cross-subsystem findings are structurally impossible. Measured on
       * a real app: 2 subsystems / 0 subsystem edges at `package`, versus 16 / 39 at
       * feature level — with the edges being the actual architecture
       * (controllers→repositories, middleware→repositories, jobs→services).
       *
       * Default is unchanged; this is opt-in while it earns trust.
       */
      granularity: z.enum(['package', 'feature']).default('package'),
    })
    .default({ mode: 'auto', granularity: 'package' }),
  subsystems: z
    .array(
      z.object({
        id: z.string().min(1),
        title: z.string().min(1),
        layer: LayerSchema.optional(),
        match: z
          .union([z.string(), z.array(z.string())])
          .transform((v) => (Array.isArray(v) ? v : [v])),
      }),
    )
    .default([]),
  detectors: z.record(z.string(), z.object({ threshold: z.number().int().positive() })).default({}),
  rules: z.array(RuleSchema).default([]),
})
export type VibegraphConfig = z.infer<typeof ConfigSchema>

export const DEFAULT_CONFIG: VibegraphConfig = ConfigSchema.parse({})

export interface LoadedConfig {
  config: VibegraphConfig
  subsystemDocs: SubsystemDoc[]
}

export async function loadConfig(projectRoot: string): Promise<LoadedConfig> {
  let config: VibegraphConfig
  const path = join(projectRoot, '.vibegraph', 'config.yml')
  if (!existsSync(path)) {
    config = DEFAULT_CONFIG
  } else {
    const raw = await readFile(path, 'utf-8')
    const data: unknown = parseYaml(raw)
    config = ConfigSchema.parse(data ?? {})
  }
  const { docs: subsystemDocs } = await loadSubsystemDocs(projectRoot)
  const effectiveRules = mergeRulesWithDefaults(config.rules ?? [])
  return { config: { ...config, rules: effectiveRules }, subsystemDocs }
}

export function mergeRulesWithDefaults(userRules: Rule[]): Rule[] {
  const userRuleIds = new Set(userRules.map((r) => r.id))
  return [...DEFAULT_BUILTIN_RULES.filter((r) => !userRuleIds.has(r.id)), ...userRules]
}
