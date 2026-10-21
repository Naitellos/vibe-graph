import { z } from 'zod'

import {
  EdgeKindSchema,
  EvidenceSchema,
  FindingSchema,
  type LoadedSnapshot,
  NodeSchema,
  isDependencyEdge,
  resolveTarget,
} from '@codearch/core'

import { ToolError } from '../errors.js'
import type { VibegraphTool } from '../server.js'

// Compact edge view per spec §6.4
const CompactEdgeSchema = z.object({
  nodeId: z.string(),
  title: z.string(),
  edgeKind: EdgeKindSchema,
  confidence: z.enum(['high', 'medium', 'low']),
  weight: z.number().int().nonnegative(),
  runtimeWeight: z.number().int().nonnegative(),
  typeOnlyWeight: z.number().int().nonnegative(),
  evidenceIds: z.array(z.string()),
})

export const GetSubsystemInput = z.object({
  id: z.string().min(1),
  includeEvidence: z.boolean().default(false),
  includeFiles: z.boolean().default(true),
})
export type GetSubsystemInputT = z.infer<typeof GetSubsystemInput>

export const GetSubsystemOutput = z.object({
  node: NodeSchema,
  dependsOn: z.array(CompactEdgeSchema),
  consumedBy: z.array(CompactEdgeSchema),
  files: z.array(z.object({ path: z.string(), importCount: z.number().int() })).optional(),
  findings: z.array(FindingSchema),
  evidence: z.array(EvidenceSchema).optional(),
})
export type GetSubsystemOutputT = z.infer<typeof GetSubsystemOutput>

export const GetSubsystemTool: VibegraphTool<GetSubsystemInputT, GetSubsystemOutputT> = {
  name: 'get_subsystem',
  description:
    'Detailed view of a node (typically a subsystem) — dependencies, consumers, files, findings, optional evidence.',
  inputSchema: GetSubsystemInput,
  outputSchema: GetSubsystemOutput,
  handler: async (input, ctx) => {
    const loaded = await ctx.reader.get()
    return buildSubsystem(loaded, input)
  },
}

/** Pure function — exported for direct testing. */
export function buildSubsystem(
  loaded: LoadedSnapshot,
  input: GetSubsystemInputT,
): GetSubsystemOutputT {
  const result = resolveTarget(loaded, input.id)
  if ('error' in result) {
    if (result.error === 'AMBIGUOUS') {
      throw new ToolError(
        'TARGET_AMBIGUOUS',
        `Multiple nodes match '${input.id}'`,
        'Use a more specific query (full node id or unique title)',
        result.candidates,
      )
    }
    throw new ToolError(
      'TARGET_NOT_FOUND',
      `No node found for '${input.id}'`,
      'Try a different query — see suggestions',
      result.candidates,
    )
  }
  const node = result

  // dependsOn: outgoing dependency edges (filtered to dep kinds)
  const outgoing = (loaded.edgesByNodeId.get(node.id) ?? []).filter(isDependencyEdge)
  const dependsOn = outgoing.map((e) => {
    const targetNode = loaded.nodesById.get(e.to)
    return {
      nodeId: e.to,
      title: targetNode?.title ?? e.to,
      edgeKind: e.kind,
      confidence: e.confidence,
      weight: e.weight,
      runtimeWeight: e.runtimeWeight,
      typeOnlyWeight: e.typeOnlyWeight,
      evidenceIds: e.evidenceIds,
    }
  })

  // consumedBy: incoming dependency edges
  const incoming = (loaded.edgesByTargetId.get(node.id) ?? []).filter(isDependencyEdge)
  const consumedBy = incoming.map((e) => {
    const sourceNode = loaded.nodesById.get(e.from)
    return {
      nodeId: e.from,
      title: sourceNode?.title ?? e.from,
      edgeKind: e.kind,
      confidence: e.confidence,
      weight: e.weight,
      runtimeWeight: e.runtimeWeight,
      typeOnlyWeight: e.typeOnlyWeight,
      evidenceIds: e.evidenceIds,
    }
  })

  // files: contained-by-this-subsystem files with import count
  let files: GetSubsystemOutputT['files'] = undefined
  if (input.includeFiles && node.kind === 'subsystem') {
    const containsEdges = (loaded.edgesByNodeId.get(node.id) ?? []).filter(
      (e) => e.kind === 'contains',
    )
    files = containsEdges.map((e) => {
      const fileId = e.to
      const path = fileId.startsWith('file:') ? fileId.slice('file:'.length) : fileId
      const importCount = (loaded.edgesByNodeId.get(fileId) ?? []).filter(
        (edge) => edge.kind === 'imports',
      ).length
      return { path, importCount }
    })
  }

  // findings: those that mention this node
  const findings = loaded.findingsByNodeId.get(node.id) ?? []

  // evidence: aggregated from all relevant edges (dependsOn + consumedBy) if requested
  let evidence: GetSubsystemOutputT['evidence'] = undefined
  if (input.includeEvidence) {
    const allEvidenceIds = new Set<string>()
    for (const e of [...outgoing, ...incoming]) {
      for (const evId of e.evidenceIds) allEvidenceIds.add(evId)
    }
    evidence = []
    for (const evId of allEvidenceIds) {
      const ev = loaded.evidenceById.get(evId)
      if (ev) evidence.push(ev)
    }
  }

  return {
    node,
    dependsOn,
    consumedBy,
    findings: [...findings],
    ...(files !== undefined ? { files } : {}),
    ...(evidence !== undefined ? { evidence } : {}),
  }
}
