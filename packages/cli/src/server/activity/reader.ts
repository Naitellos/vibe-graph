import { readFileSync } from 'node:fs'
import { join } from 'node:path'
import { type ActivityEntry, ActivityEntrySchema } from '@codearch/core'

export interface ReadActivityEntriesResult {
  entries: ActivityEntry[]
  skipped: number
}

/**
 * Reads the on-disk activity log in chronological order: the rotated file
 * (`agent-activity.ndjson.1`, older) followed by the active file
 * (`agent-activity.ndjson`, newer). The cockpit tailer rotates the active
 * file to `.1` at 10MB (see ./tailer.ts) — reading both keeps any consumer's
 * output correct across rotation instead of silently dropping pre-rotation
 * history.
 *
 * Each line is schema-validated independently; malformed lines are skipped
 * and counted rather than failing the whole read. A missing file (either or
 * both) is treated as empty. Any other fs error (e.g. EACCES) is rethrown.
 */
export function readActivityEntries(projectRoot: string): ReadActivityEntriesResult {
  const active = join(projectRoot, '.vibegraph/cache/agent-activity.ndjson')
  const rotated = `${active}.1`
  const entries: ActivityEntry[] = []
  let skipped = 0
  for (const path of [rotated, active]) {
    let raw: string
    try {
      raw = readFileSync(path, 'utf-8')
    } catch (err: unknown) {
      const e = err as NodeJS.ErrnoException
      if (e.code === 'ENOENT') continue
      throw err
    }
    for (const line of raw.split('\n')) {
      if (!line.trim()) continue
      const parsed = ActivityEntrySchema.safeParse(safeJson(line))
      if (parsed.success) entries.push(parsed.data)
      else skipped += 1
    }
  }
  return { entries, skipped }
}

function safeJson(line: string): unknown {
  try {
    return JSON.parse(line)
  } catch {
    return undefined
  }
}
