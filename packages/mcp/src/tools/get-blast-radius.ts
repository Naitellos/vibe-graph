// packages/mcp/src/tools/get-blast-radius.ts

import { z } from 'zod'

import {
  DEPENDENCY_EDGE_KINDS,
  EdgeKindSchema,
  type LoadedSnapshot,
  NodeKindSchema,
  computeBlastRadius,
  resolveTarget,
} from '@codearch/core'

import { ToolError } from '../errors.js'
import type { VibegraphTool } from '../server.js'

export const GetBlastRadiusInput = z.object({
  target: z.string().min(1),
  maxDepth: z.number().int().positive().default(5),
  edgeKinds: z.array(EdgeKindSchema).optional(),
  // TODO: 'detailed' format is reserved for future expansion (spec §6.4).
  // In v0 both values produce identical output.
  format: z.enum(['compact', 'detailed']).default('compact'),
})
export type GetBlastRadiusInputT = z.infer<typeof GetBlastRadiusInput>

export const GetBlastRadiusOutput = z.object({
  target: z.object({
    nodeId: z.string(),
    title: z.string(),
    kind: NodeKindSchema,
  }),
  direct: z.array(
    z.object({
      nodeId: z.string(),
      title: z.string(),
      via: EdgeKindSchema,
      confidence: z.enum(['high', 'medium', 'low']),
    }),
  ),
  transitive: z.array(
    z.object({
      nodeId: z.string(),
      title: z.string(),
      distance: z.number().int().positive(),
    }),
  ),
  cycles: z.array(z.object({ nodeIds: z.array(z.string()) })),
  totalAffected: z.number().int(),
})
export type GetBlastRadiusOutputT = z.infer<typeof GetBlastRadiusOutput>

export const GetBlastRadiusTool: VibegraphTool<GetBlastRadiusInputT, GetBlastRadiusOutputT> = {
  name: 'get_blast_radius',
  description:
    'Computes the set of nodes affected by changes to a target — direct (1 edge in), transitive (2+ edges in, capped at maxDepth), and any cycle co-participants.',
  inputSchema: GetBlastRadiusInput,
  outputSchema: GetBlastRadiusOutput,
  handler: async (input, ctx) => {
    const loaded = await ctx.reader.get()
    return buildBlastRadius(loaded, input)
  },
}

/** Pure function — exported for testing. */
export function buildBlastRadius(
  loaded: LoadedSnapshot,
  input: GetBlastRadiusInputT,
): GetBlastRadiusOutputT {
  const resolved = resolveTarget(loaded, input.target)
  if ('error' in resolved) {
    if (resolved.error === 'AMBIGUOUS') {
      throw new ToolError(
        'TARGET_AMBIGUOUS',
        `Multiple nodes match '${input.target}'`,
        undefined,
        resolved.candidates,
      )
    }
    throw new ToolError(
      'TARGET_NOT_FOUND',
      `No node found for '${input.target}'`,
      undefined,
      resolved.candidates,
    )
  }
  const targetNode = resolved

  const radius = computeBlastRadius(loaded, targetNode.id, {
    maxDepth: input.maxDepth,
    ...(input.edgeKinds !== undefined ? { edgeKinds: input.edgeKinds } : {}),
  })

  const kinds = new Set<string>(input.edgeKinds ?? DEPENDENCY_EDGE_KINDS)

  // For each direct consumer, find the connecting edge (incoming to targetNode from consumer)
  const direct = radius.direct.map((consumerId) => {
    const consumerNode = loaded.nodesById.get(consumerId)
    const incomingToTarget = loaded.edgesByTargetId.get(targetNode.id) ?? []
    const edge = incomingToTarget.find((e) => e.from === consumerId && kinds.has(e.kind))
    return {
      nodeId: consumerId,
      title: consumerNode?.title ?? consumerId,
      via: (edge?.kind ?? 'imports') as GetBlastRadiusOutputT['direct'][number]['via'],
      confidence: (edge?.confidence ??
        'high') as GetBlastRadiusOutputT['direct'][number]['confidence'],
    }
  })

  // For transitive, BFS with depth tracking (skip target + direct + cycles)
  const directSet = new Set(radius.direct)
  const cyclesSet = new Set(radius.cycles)
  const targetId = targetNode.id

  const transitiveWithDistance = new Map<string, number>()
  const queue: Array<{ id: string; depth: number }> = [{ id: targetId, depth: 0 }]
  const seen = new Set<string>([targetId])

  while (queue.length > 0) {
    const item = queue.shift()
    if (!item) break
    if (item.depth >= input.maxDepth) continue
    const inEdges = loaded.edgesByTargetId.get(item.id) ?? []
    for (const e of inEdges) {
      if (!kinds.has(e.kind)) continue
      if (seen.has(e.from)) continue
      seen.add(e.from)
      const nextDepth = item.depth + 1
      if (nextDepth === 1) {
        // direct bucket — skip from transitive
      } else if (!cyclesSet.has(e.from) && !directSet.has(e.from)) {
        transitiveWithDistance.set(e.from, nextDepth)
      }
      queue.push({ id: e.from, depth: nextDepth })
    }
  }

  const transitive = [...transitiveWithDistance.entries()]
    .map(([id, distance]) => {
      const n = loaded.nodesById.get(id)
      return {
        nodeId: id,
        title: n?.title ?? id,
        distance,
      }
    })
    .sort((a, b) => a.distance - b.distance || a.nodeId.localeCompare(b.nodeId))

  // Cycles: v0 simplification — flat list → single group
  const cycles = radius.cycles.length > 0 ? [{ nodeIds: [...radius.cycles].sort() }] : []

  return {
    target: {
      nodeId: targetNode.id,
      title: targetNode.title,
      kind: targetNode.kind,
    },
    direct: direct.sort((a, b) => a.nodeId.localeCompare(b.nodeId)),
    transitive,
    cycles,
    totalAffected: radius.totalAffected,
  }
}
