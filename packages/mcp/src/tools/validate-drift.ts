import type { Finding, LoadedSnapshot } from '@codearch/core'
import { z } from 'zod'

import type { VibegraphTool } from '../server.js'

// ---- schemas ----------------------------------------------------------------

export const ValidateDriftInput = z.object({
  slug: z
    .string()
    .min(1)
    .optional()
    .describe('Subsystem slug to filter findings to (without `subsystem:` prefix)'),
  includeAccepted: z
    .boolean()
    .optional()
    .default(false)
    .describe('Include accepted/ignored findings (default: false)'),
})
export type ValidateDriftInputT = z.infer<typeof ValidateDriftInput>

const FindingResponseSchema = z.object({
  id: z.string(),
  title: z.string(),
  severity: z.string(),
  status: z.string(),
  involvedNodeIds: z.array(z.string()),
})
export type FindingResponseT = z.infer<typeof FindingResponseSchema>

export const ValidateDriftOutput = z.object({
  summary: z.object({
    total: z.number().int(),
    stale: z.number().int(),
    undeclared: z.number().int(),
    unowned: z.number().int(),
  }),
  stale: z.array(FindingResponseSchema),
  undeclared: z.array(FindingResponseSchema),
  unowned: z.array(FindingResponseSchema),
})
export type ValidateDriftOutputT = z.infer<typeof ValidateDriftOutput>

// ---- tool -------------------------------------------------------------------

export const ValidateDriftTool: VibegraphTool<ValidateDriftInputT, ValidateDriftOutputT> = {
  name: 'validate_drift',
  description:
    'Returns drift findings (stale yaml / undeclared ast / unowned files) optionally filtered ' +
    'by subsystem. Excludes accepted/ignored unless includeAccepted is true.',
  inputSchema: ValidateDriftInput,
  outputSchema: ValidateDriftOutput,
  handler: async (input, ctx) => {
    const loaded = await ctx.reader.get()
    return buildValidateDrift(loaded, input)
  },
}

/** Pure function — exported for direct testing. */
export function buildValidateDrift(
  loaded: LoadedSnapshot,
  input: ValidateDriftInputT,
): ValidateDriftOutputT {
  const subsystemId = input.slug ? `subsystem:${input.slug}` : null

  const matches = (f: Finding): boolean => {
    if (f.domain !== 'drift') return false
    if (!input.includeAccepted && (f.status === 'accepted' || f.status === 'ignored')) return false
    if (subsystemId !== null && !f.involvedNodeIds.includes(subsystemId)) return false
    return true
  }

  const filtered = loaded.raw.findings.filter(matches)

  // Categorise by the Finding.type field (set by drift detectors)
  const stale = filtered.filter((f) => f.type === 'stale').map(toResponse)
  const undeclared = filtered.filter((f) => f.type === 'undeclared').map(toResponse)
  const unowned = filtered.filter((f) => f.type === 'unowned').map(toResponse)

  return {
    summary: {
      total: stale.length + undeclared.length + unowned.length,
      stale: stale.length,
      undeclared: undeclared.length,
      unowned: unowned.length,
    },
    stale,
    undeclared,
    unowned,
  }
}

function toResponse(f: Finding): FindingResponseT {
  return {
    id: f.id,
    title: f.title,
    severity: f.severity,
    status: f.status,
    involvedNodeIds: f.involvedNodeIds,
  }
}
