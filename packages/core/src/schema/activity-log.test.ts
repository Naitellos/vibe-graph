import { describe, expect, it } from 'vitest'
import { ActivityEntrySchema, generateActivityEntryId } from './activity-log.js'

describe('ActivityEntrySchema', () => {
  it('accepts a minimal valid ok-status entry', () => {
    const entry = {
      id: '1716919200000-ab12cd',
      ts: 1_716_919_200_000,
      tool: 'prepare_task',
      durationMs: 42,
      status: 'ok' as const,
      argsRedacted: '{"intent":"refactor"}',
      redactions: 0,
      truncated: false,
    }
    expect(ActivityEntrySchema.parse(entry)).toEqual(entry)
  })
  it('accepts entry with optional fields (summary, resultRedacted, errorMessage)', () => {
    const entry = {
      id: '1716919200000-xx99zz',
      ts: 1_716_919_200_000,
      tool: 'validate_diff',
      durationMs: 137,
      status: 'error' as const,
      summary: 'warn · 1 new finding',
      argsRedacted: '{"diff":"..."}',
      resultRedacted: '{"verdict":"warn"}',
      errorMessage: 'TARGET_NOT_FOUND: foo',
      redactions: 0,
      truncated: false,
    }
    expect(ActivityEntrySchema.parse(entry)).toEqual(entry)
  })
  it('rejects entry with negative durationMs', () => {
    expect(() =>
      ActivityEntrySchema.parse({
        id: 'x',
        ts: 1,
        tool: 'x',
        durationMs: -1,
        status: 'ok',
        argsRedacted: '{}',
        redactions: 0,
        truncated: false,
      }),
    ).toThrow()
  })
  it('rejects entry with unknown status', () => {
    expect(() =>
      ActivityEntrySchema.parse({
        id: 'x',
        ts: 1,
        tool: 'x',
        durationMs: 0,
        status: 'maybe',
        argsRedacted: '{}',
        redactions: 0,
        truncated: false,
      }),
    ).toThrow()
  })
})

describe('generateActivityEntryId', () => {
  it('is deterministic for same (ts, argsJson)', () => {
    expect(generateActivityEntryId(1_716_919_200_000, '{"intent":"x"}')).toBe(
      generateActivityEntryId(1_716_919_200_000, '{"intent":"x"}'),
    )
  })
  it('differs for different ts', () => {
    expect(generateActivityEntryId(1, '{}')).not.toBe(generateActivityEntryId(2, '{}'))
  })
  it('differs for different argsJson', () => {
    expect(generateActivityEntryId(1, '{"a":1}')).not.toBe(generateActivityEntryId(1, '{"a":2}'))
  })
  it('format: <ts>-<6char hash>', () => {
    expect(generateActivityEntryId(1_716_919_200_000, '{}')).toMatch(/^\d+-[a-f0-9]{6}$/)
  })
})
