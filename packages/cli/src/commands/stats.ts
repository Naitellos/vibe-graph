import { existsSync } from 'node:fs'
import { join } from 'node:path'
import { type ActivityEntry, resolveProjectRoot } from '@codearch/core'
import { defineCommand } from 'citty'
import { readActivityEntries } from '../server/activity/reader.js'

const LOOP_TOOLS = new Set(['prepare_task', 'validate_diff', 'validate_diff_hook'])
const DEFAULT_SESSION_GAP_MS = 30 * 60 * 1000

export interface WeekStats {
  week: string
  events: number
  byTool: Record<string, number>
  sessions: number
  /** Sessions with ≥1 loop-tool call (prepare_task / validate_diff / hook). */
  loopSessions: number
  hookEvents: number
}

export interface StatsReport {
  totalEvents: number
  firstTs: number | null
  lastTs: number | null
  weeks: WeekStats[]
}

/** ISO-8601 week label, UTC — e.g. '2026-W27'. */
export function isoWeek(ts: number): string {
  const d = new Date(ts)
  const date = new Date(Date.UTC(d.getUTCFullYear(), d.getUTCMonth(), d.getUTCDate()))
  const day = date.getUTCDay() || 7
  date.setUTCDate(date.getUTCDate() + 4 - day)
  const yearStart = new Date(Date.UTC(date.getUTCFullYear(), 0, 1))
  const week = Math.ceil(((date.getTime() - yearStart.getTime()) / 86_400_000 + 1) / 7)
  return `${date.getUTCFullYear()}-W${String(week).padStart(2, '0')}`
}

export function computeStats(
  entries: ActivityEntry[],
  opts: { sessionGapMs?: number } = {},
): StatsReport {
  const gap = opts.sessionGapMs ?? DEFAULT_SESSION_GAP_MS
  const sorted = [...entries].sort((a, b) => a.ts - b.ts)
  if (sorted.length === 0) return { totalEvents: 0, firstTs: null, lastTs: null, weeks: [] }

  const first = sorted[0] as ActivityEntry
  const last = sorted[sorted.length - 1] as ActivityEntry

  const weekMap = new Map<string, WeekStats>()
  const weekOf = (ts: number): WeekStats => {
    const key = isoWeek(ts)
    let w = weekMap.get(key)
    if (w === undefined) {
      w = { week: key, events: 0, byTool: {}, sessions: 0, loopSessions: 0, hookEvents: 0 }
      weekMap.set(key, w)
    }
    return w
  }

  let sessionStartTs = first.ts
  let prevTs = first.ts
  let sessionHasLoop = false
  const closeSession = (): void => {
    const w = weekOf(sessionStartTs)
    w.sessions += 1
    if (sessionHasLoop) w.loopSessions += 1
  }

  for (const e of sorted) {
    if (e.ts - prevTs > gap) {
      closeSession()
      sessionStartTs = e.ts
      sessionHasLoop = false
    }
    prevTs = e.ts
    if (LOOP_TOOLS.has(e.tool)) sessionHasLoop = true
    const w = weekOf(e.ts)
    w.events += 1
    w.byTool[e.tool] = (w.byTool[e.tool] ?? 0) + 1
    if (e.tool === 'validate_diff_hook') w.hookEvents += 1
  }
  closeSession()

  return {
    totalEvents: sorted.length,
    firstTs: first.ts,
    lastTs: last.ts,
    weeks: [...weekMap.values()].sort((a, b) => (a.week < b.week ? -1 : 1)),
  }
}

export const statsCommand = defineCommand({
  meta: {
    name: 'stats',
    description:
      'Local loop-usage stats from .vibegraph/cache/agent-activity.ndjson. ' +
      'Nothing leaves your machine; share --json output manually if you opt in.',
  },
  args: {
    root: { type: 'string', description: 'Project root (defaults to auto-resolve).' },
    json: { type: 'boolean', default: false },
  },
  async run({ args }) {
    const projectRoot = await resolveProjectRoot({ explicit: args.root, cwd: process.cwd() })
    const activePath = join(projectRoot, '.vibegraph/cache/agent-activity.ndjson')
    const rotatedPath = `${activePath}.1`
    // No log file yet (neither active nor rotated) — treated as an empty log
    // so --json always emits the stable report shape. Non-json keeps a
    // friendly message instead of a report full of zeroes.
    const hasLog = existsSync(activePath) || existsSync(rotatedPath)
    if (!hasLog && !args.json) {
      process.stdout.write('No activity log yet (.vibegraph/cache/agent-activity.ndjson).\n')
      return
    }
    const { entries, skipped } = readActivityEntries(projectRoot)
    const report = computeStats(entries)
    if (args.json) {
      process.stdout.write(`${JSON.stringify({ ...report, skipped }, null, 2)}\n`)
      return
    }
    process.stdout.write(`events: ${report.totalEvents} (skipped ${skipped} malformed lines)\n`)
    for (const w of report.weeks) {
      process.stdout.write(
        `${w.week}  events=${w.events}  sessions=${w.sessions}  loopSessions=${w.loopSessions}  hookEvents=${w.hookEvents}\n`,
      )
    }
  },
})
