import { mkdir, rm } from 'node:fs/promises'
import { tmpdir } from 'node:os'
import { join } from 'node:path'
import { afterEach, beforeEach, describe, expect, it } from 'vitest'
import type { TaskSession } from '../schema/prepare-task.js'
import { generateTaskId, loadTaskSession, writeTaskSession } from './task-session-store.js'

describe('TaskSessionStore', () => {
  let tmpRoot: string

  beforeEach(async () => {
    tmpRoot = join(tmpdir(), `vg-session-${Date.now()}-${Math.random()}`)
    await mkdir(tmpRoot, { recursive: true })
  })

  afterEach(async () => {
    await rm(tmpRoot, { recursive: true, force: true })
  })

  const sample: TaskSession = {
    taskId: 'task_2026-05-27_abc123',
    intent: 'rewrite oracle memory',
    paths: ['server/services/oracle.ts'],
    mode: 'refactor',
    baselineSnapshotId: 'scan_xyz',
    createdAt: '2026-05-27T00:00:00.000Z',
  }

  it('writes a session and reads it back identical', async () => {
    await writeTaskSession(tmpRoot, sample)
    const loaded = await loadTaskSession(tmpRoot, sample.taskId)
    expect(loaded).toEqual(sample)
  })

  it('returns null for unknown taskId', async () => {
    const loaded = await loadTaskSession(tmpRoot, 'task_nonexistent')
    expect(loaded).toBeNull()
  })

  it('generateTaskId produces stable shape (task_<YYYY-MM-DD>_<short>)', () => {
    const id = generateTaskId(new Date('2026-05-27T12:34:56.000Z'))
    expect(id).toMatch(/^task_2026-05-27_[a-z0-9]{6,}$/)
  })

  it('generateTaskId produces distinct ids on consecutive calls', () => {
    const a = generateTaskId()
    const b = generateTaskId()
    expect(a).not.toBe(b)
  })
})
