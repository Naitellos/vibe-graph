// packages/mcp/src/tools/get-project-overview.ts

import { z } from 'zod'

import { buildOverview } from '@codearch/core'

import type { ToolHandlerContext, VibegraphTool } from '../server.js'

export const GetProjectOverviewInput = z.object({
  // verbose: accepted per spec §6.4; ignored in v0. TODO(v1): use to include per-subsystem details.
  verbose: z.boolean().default(false),
})
export type GetProjectOverviewInputT = z.infer<typeof GetProjectOverviewInput>

export const GetProjectOverviewOutput = z.object({
  project: z.object({
    name: z.string(),
    root: z.string(),
    snapshotBuiltAt: z.string(),
    snapshotScanId: z.string(),
  }),
  counts: z.object({
    subsystems: z.number().int(),
    files: z.number().int(),
    edges: z.number().int(),
    findings: z.number().int(),
    externalPackages: z.number().int(),
  }),
  layers: z.array(z.object({ layer: z.string(), nodeCount: z.number().int() })),
  subsystemLayers: z
    .array(z.object({ layer: z.string(), subsystemCount: z.number().int() }))
    .default([]),
  autoDetected: z.boolean().default(false),
  topFindings: z.array(
    z.object({
      id: z.string(),
      type: z.string(),
      severity: z.string(),
      title: z.string(),
      involvedNodeIds: z.array(z.string()),
      location: z
        .object({ file: z.string(), line: z.number().int().positive().optional() })
        .optional(),
    }),
  ),
  topHubs: z.array(
    z.object({
      nodeId: z.string(),
      title: z.string(),
      fanIn: z.number().int(),
      fanOut: z.number().int(),
    }),
  ),
})
export type GetProjectOverviewOutputT = z.infer<typeof GetProjectOverviewOutput>

export const GetProjectOverviewTool: VibegraphTool<
  GetProjectOverviewInputT,
  GetProjectOverviewOutputT
> = {
  name: 'get_project_overview',
  description:
    'Compact summary of the indexed project: counts, layers, top findings, top dependency hubs.',
  inputSchema: GetProjectOverviewInput,
  outputSchema: GetProjectOverviewOutput,
  handler: async (_input, ctx): Promise<GetProjectOverviewOutputT> => {
    return buildOverview(await ctx.reader.get())
  },
}

// Suppress TS "unused parameter" warning: _input.verbose is accepted per spec but ignored in v0.
void (GetProjectOverviewTool as unknown)
