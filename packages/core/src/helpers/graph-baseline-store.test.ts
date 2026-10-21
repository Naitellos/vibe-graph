import { mkdir, readFile, rm } from 'node:fs/promises'
import { tmpdir } from 'node:os'
import { join } from 'node:path'
import { afterEach, beforeEach, describe, expect, it } from 'vitest'
import type { GraphBaseline } from '../schema/graph-baseline.js'
import { loadGraphBaseline, writeGraphBaseline } from './graph-baseline-store.js'

describe('GraphBaselineStore', () => {
  let tmpRoot: string

  beforeEach(async () => {
    tmpRoot = join(tmpdir(), `vg-baseline-test-${Date.now()}-${Math.random()}`)
    await mkdir(tmpRoot, { recursive: true })
  })

  afterEach(async () => {
    await rm(tmpRoot, { recursive: true, force: true })
  })

  const sample: GraphBaseline = {
    schemaVersion: '1.0',
    snapshotId: 'scan_abc',
    createdAt: '2026-05-27T00:00:00.000Z',
    fingerprint: 'sha256:test',
    nodes: [],
    edges: [],
    findings: [],
  }

  it('returns null when baseline file does not exist', async () => {
    const result = await loadGraphBaseline(tmpRoot)
    expect(result).toBeNull()
  })

  it('writes and reads back identical baseline', async () => {
    await writeGraphBaseline(tmpRoot, sample)
    const loaded = await loadGraphBaseline(tmpRoot)
    expect(loaded).toEqual(sample)
  })

  it('write is atomic: no .tmp file leftover after success', async () => {
    await writeGraphBaseline(tmpRoot, sample)
    const expectedPath = join(tmpRoot, '.vibegraph', 'cache', 'baseline.json')
    const tmpPath = `${expectedPath}.tmp`
    await expect(readFile(tmpPath)).rejects.toThrow()
    const content = await readFile(expectedPath, 'utf-8')
    expect(JSON.parse(content).snapshotId).toBe('scan_abc')
  })

  it('returns null and does not throw on corrupted JSON', async () => {
    const baselinePath = join(tmpRoot, '.vibegraph', 'cache', 'baseline.json')
    await mkdir(join(tmpRoot, '.vibegraph', 'cache'), { recursive: true })
    const { writeFile } = await import('node:fs/promises')
    await writeFile(baselinePath, '{ invalid json', 'utf-8')
    const result = await loadGraphBaseline(tmpRoot)
    expect(result).toBeNull()
  })

  it('overwrites existing baseline atomically', async () => {
    await writeGraphBaseline(tmpRoot, sample)
    const updated: GraphBaseline = { ...sample, snapshotId: 'scan_def', fingerprint: 'sha256:next' }
    await writeGraphBaseline(tmpRoot, updated)
    const loaded = await loadGraphBaseline(tmpRoot)
    expect(loaded?.snapshotId).toBe('scan_def')
    expect(loaded?.fingerprint).toBe('sha256:next')
  })
})
