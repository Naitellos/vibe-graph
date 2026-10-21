import { mkdtemp, readFile, rm } from 'node:fs/promises'
import { tmpdir } from 'node:os'
import { join } from 'node:path'
import { afterEach, beforeEach, describe, expect, it } from 'vitest'
import { loadBaseline, writeBaselineEntry } from './baseline-store.js'

describe('baseline-store', () => {
  let tmpRoot: string
  beforeEach(async () => {
    tmpRoot = await mkdtemp(join(tmpdir(), 'vg-baseline-'))
  })
  afterEach(async () => {
    await rm(tmpRoot, { recursive: true, force: true })
  })

  it('loadBaseline returns empty Map when no file exists', async () => {
    const baseline = await loadBaseline(tmpRoot)
    expect(baseline.size).toBe(0)
  })

  it('writeBaselineEntry creates file and loadBaseline reads the entry', async () => {
    await writeBaselineEntry(tmpRoot, { findingId: 'drift:stale:a:b', status: 'accepted' })
    const baseline = await loadBaseline(tmpRoot)
    expect(baseline.size).toBe(1)
    expect(baseline.get('drift:stale:a:b')?.status).toBe('accepted')
  })

  it('writeBaselineEntry preserves existing entries', async () => {
    await writeBaselineEntry(tmpRoot, { findingId: 'finding:1', status: 'accepted' })
    await writeBaselineEntry(tmpRoot, { findingId: 'finding:2', status: 'ignored' })
    const baseline = await loadBaseline(tmpRoot)
    expect(baseline.size).toBe(2)
    expect(baseline.get('finding:1')?.status).toBe('accepted')
    expect(baseline.get('finding:2')?.status).toBe('ignored')
  })

  it('writeBaselineEntry persists optional note and acceptedBy', async () => {
    await writeBaselineEntry(tmpRoot, {
      findingId: 'f:x',
      status: 'ignored',
      acceptedBy: 'alice',
      note: 'reviewed, expected',
    })
    const baseline = await loadBaseline(tmpRoot)
    const entry = baseline.get('f:x')
    expect(entry?.acceptedBy).toBe('alice')
    expect(entry?.note).toBe('reviewed, expected')
  })

  it('50 concurrent writeBaselineEntry calls all persist (atomic)', async () => {
    const writes = Array.from({ length: 50 }, (_, i) =>
      writeBaselineEntry(tmpRoot, {
        findingId: `f:${i}`,
        status: i % 2 === 0 ? 'accepted' : 'ignored',
      }),
    )
    await Promise.all(writes)
    const baseline = await loadBaseline(tmpRoot)
    expect(baseline.size).toBe(50)
    for (let i = 0; i < 50; i++) {
      expect(baseline.get(`f:${i}`)?.status).toBe(i % 2 === 0 ? 'accepted' : 'ignored')
    }
    // File parses cleanly — no partial writes
    const text = await readFile(join(tmpRoot, '.vibegraph', 'drift-baseline.json'), 'utf-8')
    expect(() => JSON.parse(text)).not.toThrow()
  })

  it('rejects unknown status (schema validation)', async () => {
    await expect(
      writeBaselineEntry(tmpRoot, { findingId: 'f:bad', status: 'mystery' as never }),
    ).rejects.toThrow()
  })
})
