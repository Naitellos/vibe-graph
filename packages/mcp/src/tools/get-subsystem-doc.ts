import { type LoadedSnapshot, loadSubsystemDocs } from '@codearch/core'
import { z } from 'zod'

import { ToolError } from '../errors.js'
import type { VibegraphTool } from '../server.js'

// ---- schemas ----------------------------------------------------------------

export const GetSubsystemDocInput = z.object({
  slug: z.string().min(1).describe('Subsystem slug (without `subsystem:` prefix)'),
})
export type GetSubsystemDocInputT = z.infer<typeof GetSubsystemDocInput>

export const GetSubsystemDocOutput = z.object({
  id: z.string(),
  title: z.string(),
  layer: z.string(),
  status: z.string(),
  description: z.string(),
  lastVerified: z.string().optional(),
  verifiedBy: z.string().optional(),
  match: z.array(z.string()),
  declaredDependsOn: z.array(z.string()),
  declaredConsumedBy: z.array(z.string()),
  /** Distinct subsystem slugs that this subsystem depends on per AST/derived edges. */
  astDependsOn: z.array(z.string()),
  /** Distinct subsystem slugs that depend on this subsystem per AST/derived edges. */
  astConsumedBy: z.array(z.string()),
  /** Count of `contains` edges from this subsystem node. */
  ownedFilesCount: z.number().int(),
  schemaTables: z.array(z.string()),
  relatedSpecs: z.array(z.string()),
  relatedDecisions: z.array(z.string()),
  memoryRefs: z.array(z.string()),
  driftSummary: z.object({
    open: z.number().int(),
    accepted: z.number().int(),
    ignored: z.number().int(),
  }),
})
export type GetSubsystemDocOutputT = z.infer<typeof GetSubsystemDocOutput>

// ---- tool -------------------------------------------------------------------

export const GetSubsystemDocTool: VibegraphTool<GetSubsystemDocInputT, GetSubsystemDocOutputT> = {
  name: 'get_subsystem_doc',
  description:
    'Returns rich SubsystemDoc + AST-derived deps + drift summary for a subsystem. ' +
    'Superset of get_subsystem — includes curated documentation fields, AST-inferred ' +
    'dependency splits, owned file count, and a structured drift summary.',
  inputSchema: GetSubsystemDocInput,
  outputSchema: GetSubsystemDocOutput,
  handler: async (input, ctx) => {
    const loaded = await ctx.reader.get()
    return buildSubsystemDoc(loaded, input)
  },
}

/** Pure function — exported for direct testing. */
export async function buildSubsystemDoc(
  loaded: LoadedSnapshot,
  input: GetSubsystemDocInputT,
): Promise<GetSubsystemDocOutputT> {
  const subsystemNodeId = `subsystem:${input.slug}`

  const node = loaded.nodesById.get(subsystemNodeId)
  if (!node) {
    throw new ToolError(
      'TARGET_NOT_FOUND',
      `No subsystem found with slug "${input.slug}"`,
      'Check available subsystems via get_project_overview',
    )
  }

  // Load curated subsystem docs from .vibegraph/subsystems/*.yml
  const { docs } = await loadSubsystemDocs(loaded.raw.meta.projectRoot)
  const doc = docs.find((d) => d.id === input.slug)

  // Compute AST-derived dependencies (exclude yaml-sourced edges)
  const astDependsOnSet = new Set<string>()
  const astConsumedBySet = new Set<string>()

  for (const e of loaded.raw.edges) {
    if (e.source === 'yaml') continue
    if (e.kind !== 'depends_on') continue
    if (!e.from.startsWith('subsystem:') || !e.to.startsWith('subsystem:')) continue

    if (e.from === subsystemNodeId) {
      astDependsOnSet.add(e.to.replace(/^subsystem:/, ''))
    }
    if (e.to === subsystemNodeId) {
      astConsumedBySet.add(e.from.replace(/^subsystem:/, ''))
    }
  }

  // Compute ownedFilesCount: count of 'contains' edges from this subsystem
  let ownedFilesCount = 0
  for (const e of loaded.raw.edges) {
    if (e.kind === 'contains' && e.from === subsystemNodeId) {
      ownedFilesCount++
    }
  }

  // Compute drift summary from findings involving this subsystem
  let driftOpen = 0
  let driftAccepted = 0
  let driftIgnored = 0

  for (const f of loaded.raw.findings) {
    if (f.domain !== 'drift') continue
    if (!f.involvedNodeIds.includes(subsystemNodeId)) continue

    if (f.status === 'accepted') {
      driftAccepted++
    } else if (f.status === 'ignored') {
      driftIgnored++
    } else {
      driftOpen++
    }
  }

  return {
    id: input.slug,
    title: doc?.title ?? node.title,
    layer: doc?.layer ?? node.layer ?? 'unknown',
    status: doc?.status ?? node.status ?? 'unknown',
    description: doc?.description ?? '',
    ...(doc?.last_verified !== undefined ? { lastVerified: doc.last_verified } : {}),
    ...(doc?.verified_by !== undefined ? { verifiedBy: doc.verified_by } : {}),
    match: doc?.match ?? [],
    declaredDependsOn: doc?.depends_on ?? [],
    declaredConsumedBy: doc?.consumed_by ?? [],
    astDependsOn: [...astDependsOnSet].sort(),
    astConsumedBy: [...astConsumedBySet].sort(),
    ownedFilesCount,
    schemaTables: doc?.schema_tables ?? [],
    relatedSpecs: doc?.related_specs ?? [],
    relatedDecisions: doc?.related_decisions ?? [],
    memoryRefs: doc?.memory_refs ?? [],
    driftSummary: { open: driftOpen, accepted: driftAccepted, ignored: driftIgnored },
  }
}
