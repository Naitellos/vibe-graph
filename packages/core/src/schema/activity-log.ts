import { createHash } from 'node:crypto'
import { z } from 'zod'

export const ActivityEntrySchema = z.object({
  id: z.string().min(1),
  ts: z.number().int().nonnegative(),
  tool: z.string().min(1),
  durationMs: z.number().int().nonnegative(),
  status: z.enum(['ok', 'error']),
  summary: z.string().optional(),
  argsRedacted: z.string(),
  resultRedacted: z.string().optional(),
  errorMessage: z.string().optional(),
  redactions: z.number().int().nonnegative(),
  truncated: z.boolean(),
})

export type ActivityEntry = z.infer<typeof ActivityEntrySchema>

/** Deterministic id `${ts}-${first 6 hex of sha1(argsJson)}` — stable across processes so the tailer's LRU dedupe works. */
export function generateActivityEntryId(ts: number, argsJson: string): string {
  const hash = createHash('sha1').update(argsJson).digest('hex').slice(0, 6)
  return `${ts}-${hash}`
}
