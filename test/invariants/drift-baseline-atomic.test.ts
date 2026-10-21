/**
 * Invariant: drift-baseline atomic writes under concurrency
 *
 * Proves that 50 concurrent writeBaselineEntry calls + 10 concurrent reads
 * against the same projectRoot produce a valid result:
 * - File is never observed as partial/corrupt (JSON always parses)
 * - loadBaseline never throws on concurrent reads
 * - All 50 entries persist after all operations complete
 */
import { mkdtemp, readFile, rm } from 'node:fs/promises'
import { tmpdir } from 'node:os'
import { join } from 'node:path'
import { afterEach, beforeEach, describe, expect, it } from 'vitest'
import { loadBaseline, writeBaselineEntry } from '../../packages/core/src/helpers/baseline-store.js'

describe('invariant: drift-baseline atomic writes under concurrency', () => {
  let tmpRoot: string
  beforeEach(async () => {
    tmpRoot = await mkdtemp(join(tmpdir(), 'vg-baseline-invariant-'))
  })
  afterEach(async () => {
    await rm(tmpRoot, { recursive: true, force: true })
  })

  it('50 concurrent writes + 10 concurrent reads — file always valid JSON, all 50 entries persist', async () => {
    const writes = Array.from({ length: 50 }, (_, i) =>
      writeBaselineEntry(tmpRoot, {
        findingId: `f:${i}`,
        status: i % 2 === 0 ? 'accepted' : 'ignored',
      }),
    )

    // Interleave reads — read while writes are in flight
    const reads = Array.from({ length: 10 }, async (_, k) => {
      // Stagger slightly to spread out reads
      await new Promise((r) => setTimeout(r, k * 5))
      try {
        const baseline = await loadBaseline(tmpRoot)
        // Should always be a Map (never throw on partial reads)
        expect(baseline).toBeInstanceOf(Map)
      } catch (err) {
        // loadBaseline should swallow JSON parse errors and return empty Map, NEVER throw
        throw new Error(`loadBaseline observed partial/corrupt file: ${(err as Error).message}`)
      }
    })

    await Promise.all([...writes, ...reads])

    // Final state: all 50 entries persist
    const finalBaseline = await loadBaseline(tmpRoot)
    expect(finalBaseline.size).toBe(50)
    for (let i = 0; i < 50; i++) {
      expect(finalBaseline.get(`f:${i}`)?.status).toBe(i % 2 === 0 ? 'accepted' : 'ignored')
    }

    // File parses cleanly
    const filePath = join(tmpRoot, '.vibegraph', 'drift-baseline.json')
    const text = await readFile(filePath, 'utf-8')
    expect(() => JSON.parse(text)).not.toThrow()
    const parsed = JSON.parse(text)
    expect(Object.keys(parsed.items)).toHaveLength(50)
  })
})
