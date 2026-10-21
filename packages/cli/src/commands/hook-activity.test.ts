import { mkdtempSync, readFileSync } from 'node:fs'
import { tmpdir } from 'node:os'
import { join } from 'node:path'
import { ActivityEntrySchema, type Finding } from '@codearch/core'
import { describe, expect, it } from 'vitest'
import { appendActivityEntry, buildHookActivityEntry } from './hook-activity.js'

const okResult = {
  status: 'ok' as const,
  verdict: 'warn' as const,
  newViolations: [],
  removedViolations: [],
  newFindings: [{} as Finding],
  removedFindings: [],
  exitCode: 0 as const,
}

describe('buildHookActivityEntry', () => {
  it('summarizes an ok result and passes schema', () => {
    const entry = buildHookActivityEntry(okResult, {
      now: 1700000000000,
      durationMs: 42,
      against: 'HEAD',
      mode: 'advisory',
    })
    expect(entry.tool).toBe('validate_diff_hook')
    expect(entry.status).toBe('ok')
    expect(entry.durationMs).toBe(42)
    expect(entry.summary).toBe('verdict=warn newViolations=0 newFindings=1')
    expect(ActivityEntrySchema.parse(entry)).toEqual(entry)
  })

  it('captures an error result', () => {
    const entry = buildHookActivityEntry(
      { status: 'error', error: 'NO_BASELINE: run baseline first' },
      { now: 1700000000000, durationMs: 5 },
    )
    expect(entry.status).toBe('error')
    expect(entry.errorMessage).toContain('NO_BASELINE')
    expect(ActivityEntrySchema.parse(entry)).toEqual(entry)
  })
})

describe('appendActivityEntry', () => {
  it('appends parseable ndjson lines, creating the cache dir', () => {
    const root = mkdtempSync(join(tmpdir(), 'vg-hook-activity-'))
    const entry = buildHookActivityEntry(okResult, { now: 1700000000000, durationMs: 1 })
    appendActivityEntry(root, entry)
    appendActivityEntry(root, entry)
    const lines = readFileSync(join(root, '.vibegraph/cache/agent-activity.ndjson'), 'utf-8')
      .trim()
      .split('\n')
    expect(lines).toHaveLength(2)
    expect(ActivityEntrySchema.parse(JSON.parse(lines[0]))).toBeTruthy()
  })

  it('never throws on unwritable root', () => {
    const entry = buildHookActivityEntry(okResult, { now: 1, durationMs: 1 })
    expect(() => appendActivityEntry('/dev/null/nope', entry)).not.toThrow()
  })
})
