import {
  appendFileSync,
  mkdirSync,
  mkdtempSync,
  rmSync,
  statSync,
  utimesSync,
  writeFileSync,
} from 'node:fs'
import { tmpdir } from 'node:os'
import { join } from 'node:path'
import type { ActivityEntry } from '@codearch/core'
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import { createActivityTailer } from './tailer.js'

let tmpRoot: string
let logPath: string
beforeEach(() => {
  tmpRoot = mkdtempSync(join(tmpdir(), 'vibegraph-tailer-'))
  mkdirSync(join(tmpRoot, '.vibegraph/cache'), { recursive: true })
  logPath = join(tmpRoot, '.vibegraph/cache/agent-activity.ndjson')
})
afterEach(() => {
  rmSync(tmpRoot, { recursive: true, force: true })
})
function makeEntry(id: string, ts = 1): ActivityEntry {
  return {
    id,
    ts,
    tool: 'x',
    durationMs: 0,
    status: 'ok',
    argsRedacted: '{}',
    redactions: 0,
    truncated: false,
  }
}
describe('createActivityTailer', () => {
  it('initial offset = current file size (skips historic entries)', async () => {
    writeFileSync(logPath, `${JSON.stringify(makeEntry('historic'))}\n`)
    const broadcast = vi.fn()
    const tailer = createActivityTailer({ projectRoot: tmpRoot, broadcast })
    await tailer.start()
    expect(broadcast).not.toHaveBeenCalled()
    await tailer.stop()
  })
  it('broadcasts new appends after start', async () => {
    writeFileSync(logPath, '')
    const broadcast = vi.fn()
    const tailer = createActivityTailer({ projectRoot: tmpRoot, broadcast })
    await tailer.start()
    appendFileSync(logPath, `${JSON.stringify(makeEntry('new1'))}\n`)
    await waitForCondition(() => broadcast.mock.calls.length >= 1, 2000)
    expect(broadcast).toHaveBeenCalledWith({
      type: 'activity',
      entry: expect.objectContaining({ id: 'new1' }),
    })
    await tailer.stop()
  })
  it('handles partial-line writes (buffers until \\n arrives)', async () => {
    writeFileSync(logPath, '')
    const broadcast = vi.fn()
    const tailer = createActivityTailer({ projectRoot: tmpRoot, broadcast })
    await tailer.start()
    const full = JSON.stringify(makeEntry('split'))
    appendFileSync(logPath, full.slice(0, 10))
    await sleep(80)
    expect(broadcast).not.toHaveBeenCalled()
    appendFileSync(logPath, `${full.slice(10)}\n`)
    await waitForCondition(() => broadcast.mock.calls.length >= 1, 2000)
    expect(broadcast).toHaveBeenCalledTimes(1)
    await tailer.stop()
  })
  it('dedupes entries by id (LRU)', async () => {
    writeFileSync(logPath, '')
    const broadcast = vi.fn()
    const tailer = createActivityTailer({ projectRoot: tmpRoot, broadcast })
    await tailer.start()
    appendFileSync(logPath, `${JSON.stringify(makeEntry('dup'))}\n`)
    await waitForCondition(() => broadcast.mock.calls.length >= 1, 2000)
    appendFileSync(logPath, `${JSON.stringify(makeEntry('dup'))}\n`)
    await sleep(150)
    expect(broadcast).toHaveBeenCalledTimes(1)
    await tailer.stop()
  })
  it('skips corrupt lines, broadcasts valid ones', async () => {
    writeFileSync(logPath, '')
    const broadcast = vi.fn()
    const tailer = createActivityTailer({ projectRoot: tmpRoot, broadcast })
    await tailer.start()
    appendFileSync(logPath, `not-json\n${JSON.stringify(makeEntry('valid'))}\n`)
    await waitForCondition(() => broadcast.mock.calls.length >= 1, 2000)
    expect(broadcast).toHaveBeenCalledTimes(1)
    expect(broadcast).toHaveBeenCalledWith({
      type: 'activity',
      entry: expect.objectContaining({ id: 'valid' }),
    })
    await tailer.stop()
  })
  it('rotates when active file exceeds limitBytes; resets state', async () => {
    writeFileSync(logPath, '')
    const broadcast = vi.fn()
    const tailer = createActivityTailer({ projectRoot: tmpRoot, broadcast, rotateAtBytes: 100 })
    await tailer.start()
    for (let i = 0; i < 10; i++)
      appendFileSync(logPath, `${JSON.stringify(makeEntry(`r${i}`, i + 1))}\n`)
    await waitForCondition(() => {
      try {
        return statSync(`${logPath}.1`).isFile()
      } catch {
        return false
      }
    }, 2000).catch(() => undefined)
    expect(() => statSync(`${logPath}.1`)).not.toThrow()
    await tailer.stop()
  })
  it('does not re-broadcast historic entries on a no-op change (size unchanged)', async () => {
    writeFileSync(logPath, `${JSON.stringify(makeEntry('historic'))}\n`)
    const broadcast = vi.fn()
    const tailer = createActivityTailer({ projectRoot: tmpRoot, broadcast })
    await tailer.start() // offset = current size; historic skipped
    // Append a real new entry so broadcast is called exactly once, confirming the
    // tailer is working before we attempt the no-op touch.
    appendFileSync(logPath, `${JSON.stringify(makeEntry('new-entry'))}\n`)
    await waitForCondition(() => broadcast.mock.calls.length >= 1, 2000)
    expect(broadcast).toHaveBeenCalledTimes(1)
    expect(broadcast).toHaveBeenCalledWith({
      type: 'activity',
      entry: expect.objectContaining({ id: 'new-entry' }),
    })
    // Touch the file's mtime without changing its content — fires a chokidar 'change'
    // event with size === lastReadOffset. The fix ensures this does NOT reset the offset
    // and re-broadcast the historic entry.
    const now = new Date()
    utimesSync(logPath, now, now)
    await sleep(300) // longer than awaitWriteFinish stabilityThreshold
    expect(broadcast).toHaveBeenCalledTimes(1) // count must remain 1
    await tailer.stop()
  })
})
async function sleep(ms: number) {
  return new Promise((r) => setTimeout(r, ms))
}
async function waitForCondition(cond: () => boolean, timeoutMs: number) {
  const start = Date.now()
  while (!cond() && Date.now() - start < timeoutMs) await sleep(20)
  if (!cond()) throw new Error('waitForCondition timeout')
}
