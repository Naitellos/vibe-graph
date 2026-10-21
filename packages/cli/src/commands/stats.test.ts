import { mkdirSync, mkdtempSync, realpathSync, writeFileSync } from 'node:fs'
import { tmpdir } from 'node:os'
import { join } from 'node:path'
import type { ActivityEntry } from '@codearch/core'
import { describe, expect, it, vi } from 'vitest'
import { computeStats, isoWeek, statsCommand } from './stats.js'

function entry(ts: number, tool: string): ActivityEntry {
  return {
    id: `${ts}-x`,
    ts,
    tool,
    durationMs: 1,
    status: 'ok',
    argsRedacted: '{}',
    redactions: 0,
    truncated: false,
  }
}

// 2026-07-01T10:00Z — среда, ISO-неделя 2026-W27
const W27 = Date.UTC(2026, 6, 1, 10, 0, 0)
// 2026-07-08T10:00Z — следующая среда, 2026-W28
const W28 = Date.UTC(2026, 6, 8, 10, 0, 0)
const MIN = 60_000

describe('isoWeek', () => {
  it('maps timestamps to ISO weeks', () => {
    expect(isoWeek(W27)).toBe('2026-W27')
    expect(isoWeek(W28)).toBe('2026-W28')
  })

  it('crosses a year boundary forward into the next ISO year (2024-12-30 → 2025-W01)', () => {
    expect(isoWeek(Date.UTC(2024, 11, 30))).toBe('2025-W01')
  })

  it('crosses a year boundary backward into the previous ISO year (2027-01-01 → 2026-W53)', () => {
    expect(isoWeek(Date.UTC(2027, 0, 1))).toBe('2026-W53')
  })
})

describe('computeStats', () => {
  it('sessionizes by gap and counts loop sessions per week', () => {
    const entries = [
      entry(W27, 'get_project_overview'),
      entry(W27 + 5 * MIN, 'validate_diff_hook'), // та же сессия → loop-сессия
      entry(W27 + 90 * MIN, 'get_subsystem'), // gap 85min > 30min → новая сессия, не loop
      entry(W28, 'prepare_task'), // новая неделя, новая сессия, loop
    ]
    const report = computeStats(entries)
    expect(report.totalEvents).toBe(4)
    expect(report.weeks).toHaveLength(2)
    const [w27, w28] = report.weeks
    expect(w27.week).toBe('2026-W27')
    expect(w27.sessions).toBe(2)
    expect(w27.loopSessions).toBe(1)
    expect(w27.hookEvents).toBe(1)
    expect(w27.byTool.get_project_overview).toBe(1)
    expect(w28.sessions).toBe(1)
    expect(w28.loopSessions).toBe(1)
    expect(w28.hookEvents).toBe(0)
  })

  it('handles empty input', () => {
    const report = computeStats([])
    expect(report.totalEvents).toBe(0)
    expect(report.weeks).toEqual([])
    expect(report.firstTs).toBeNull()
  })
})

// ── statsCommand run() — CLI boundary ───────────────────────────────────────
//
// Mirrors the `checkCommand` CLI-boundary idiom in check.test.ts: spy on
// process.stdout.write to capture exactly what the citty run() handler
// emits, since the bug under test (missing-file branch bypassing the
// --json check) lives in the wiring, not in computeStats/isoWeek.

function mkTmp(): string {
  return realpathSync(mkdtempSync(join(tmpdir(), 'vg-cli-stats-')))
}

function captureStdout(): { chunks: string[]; restore: () => void } {
  const chunks: string[] = []
  const spy = vi.spyOn(process.stdout, 'write').mockImplementation((chunk) => {
    chunks.push(typeof chunk === 'string' ? chunk : String(chunk))
    return true
  })
  return { chunks, restore: () => spy.mockRestore() }
}

async function runStatsCommand(root: string, json: boolean): Promise<string> {
  const { chunks, restore } = captureStdout()
  try {
    await statsCommand.run?.({ args: { root, json }, cmd: statsCommand })
  } finally {
    restore()
  }
  return chunks.join('')
}

describe('statsCommand run()', () => {
  it('missing log file + --json → stdout parses as valid JSON with totalEvents 0', async () => {
    const root = mkTmp()
    const output = await runStatsCommand(root, true)
    const parsed = JSON.parse(output)
    expect(parsed.totalEvents).toBe(0)
    expect(parsed.skipped).toBe(0)
    expect(parsed.weeks).toEqual([])
  })

  it('missing log file without --json → friendly plain-text message', async () => {
    const root = mkTmp()
    const output = await runStatsCommand(root, false)
    expect(output).toContain('No activity log yet')
    expect(() => JSON.parse(output)).toThrow()
  })

  it('one valid + one malformed line → skipped counted in --json output', async () => {
    const root = mkTmp()
    mkdirSync(join(root, '.vibegraph', 'cache'), { recursive: true })
    const valid = entry(W27, 'get_project_overview')
    writeFileSync(
      join(root, '.vibegraph', 'cache', 'agent-activity.ndjson'),
      `${JSON.stringify(valid)}\nnot valid json\n`,
    )
    const output = await runStatsCommand(root, true)
    const parsed = JSON.parse(output)
    expect(parsed.totalEvents).toBe(1)
    expect(parsed.skipped).toBe(1)
  })

  // The cockpit tailer rotates agent-activity.ndjson → agent-activity.ndjson.1
  // at 10MB (see server/activity/tailer.ts). stats must read both files —
  // rotated (older) then active (newer) — or it silently drops all
  // pre-rotation history from the habit metric it exists to measure.
  it('combines rotated (.1, older) + active (newer) logs into one report', async () => {
    const root = mkTmp()
    mkdirSync(join(root, '.vibegraph', 'cache'), { recursive: true })
    const older = entry(W27, 'get_project_overview')
    const newer = entry(W28, 'prepare_task')
    writeFileSync(
      join(root, '.vibegraph', 'cache', 'agent-activity.ndjson.1'),
      `${JSON.stringify(older)}\n`,
    )
    writeFileSync(
      join(root, '.vibegraph', 'cache', 'agent-activity.ndjson'),
      `${JSON.stringify(newer)}\n`,
    )
    const output = await runStatsCommand(root, true)
    const parsed = JSON.parse(output)
    expect(parsed.totalEvents).toBe(2)
    expect(parsed.skipped).toBe(0)
    expect(parsed.weeks.map((w: { week: string }) => w.week)).toEqual(['2026-W27', '2026-W28'])
  })

  it('counts malformed lines from either the rotated or active file in skipped', async () => {
    const root = mkTmp()
    mkdirSync(join(root, '.vibegraph', 'cache'), { recursive: true })
    const older = entry(W27, 'get_project_overview')
    const newer = entry(W28, 'prepare_task')
    writeFileSync(
      join(root, '.vibegraph', 'cache', 'agent-activity.ndjson.1'),
      `${JSON.stringify(older)}\nbad line in rotated\n`,
    )
    writeFileSync(
      join(root, '.vibegraph', 'cache', 'agent-activity.ndjson'),
      `${JSON.stringify(newer)}\nbad line in active\n`,
    )
    const output = await runStatsCommand(root, true)
    const parsed = JSON.parse(output)
    expect(parsed.totalEvents).toBe(2)
    expect(parsed.skipped).toBe(2)
  })
})
