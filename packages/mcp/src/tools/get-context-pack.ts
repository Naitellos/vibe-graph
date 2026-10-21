// packages/mcp/src/tools/get-context-pack.ts

import {
  ContextPackSchema,
  type LoadedSnapshot,
  buildContextPack,
  createIgnoreMatcher,
  resolveTarget,
} from '@codearch/core'
import { z } from 'zod'
import { ToolError } from '../errors.js'
import type { VibegraphTool } from '../server.js'

export const GetContextPackInput = z.object({
  target: z.string().min(1),
  budget: z
    .object({
      maxTokens: z.number().int().positive().default(8000),
      maxFiles: z.number().int().positive().default(10),
    })
    .default({ maxTokens: 8000, maxFiles: 10 }),
  intent: z.string().optional(),
})
export type GetContextPackInputT = z.infer<typeof GetContextPackInput>

export const GetContextPackOutput = ContextPackSchema
export type GetContextPackOutputT = z.infer<typeof GetContextPackOutput>

export const GetContextPackTool: VibegraphTool<GetContextPackInputT, GetContextPackOutputT> = {
  name: 'get_context_pack',
  description:
    'Builds a compact, token-budgeted context bundle for a target — summary, facts, critical files (secret-redacted), relationships, blast radius. 70% files / 30% structural.',
  inputSchema: GetContextPackInput,
  outputSchema: GetContextPackOutput,
  handler: async (input, ctx): Promise<GetContextPackOutputT> => {
    const loaded = await ctx.reader.get()
    return runContextPack(loaded, input)
  },
}

/**
 * Pure function for direct testing. Resolves target, validates, delegates to core builder.
 *
 * TODO(Phase 4): wire `.vibegraphignore` by reading it via the CLI layer and passing
 * actual patterns here instead of `[]`. In v0 we use only the built-in default ignores.
 */
export async function runContextPack(
  loaded: LoadedSnapshot,
  input: GetContextPackInputT,
): Promise<GetContextPackOutputT> {
  // Resolve target — surface TARGET_NOT_FOUND / TARGET_AMBIGUOUS as ToolErrors
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

  // TODO(Phase 4): replace `patterns: []` with patterns read from .vibegraphignore (CLI concern)
  const ignore = createIgnoreMatcher({ patterns: [], includeDefaults: true })

  return buildContextPack(loaded, {
    target: targetNode.id,
    maxTokens: input.budget.maxTokens,
    maxFiles: input.budget.maxFiles,
    projectRoot: loaded.raw.meta.projectRoot,
    ignore,
    ...(input.intent !== undefined ? { intent: input.intent } : {}),
  })
}
