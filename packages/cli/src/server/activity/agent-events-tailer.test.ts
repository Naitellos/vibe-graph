import { appendFileSync, mkdirSync, mkdtempSync, rmSync, writeFileSync } from 'node:fs'
import { tmpdir } from 'node:os'
import { join } from 'node:path'
import type { ValidateDiffUiPayload } from '@codearch/core'
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import { createAgentEventsTailer } from './agent-events-tailer.js'

let tmpRoot: string
let logPath: string
beforeEach(() => {
  tmpRoot = mkdtempSync(join(tmpdir(), 'vibegraph-agent-events-tailer-'))
  mkdirSync(join(tmpRoot, '.vibegraph/cache'), { recursive: true })
  logPath = join(tmpRoot, '.vibegraph/cache/agent-events.ndjson')
})
afterEach(() => {
  rmSync(tmpRoot, { recursive: true, force: true })
})

function makePayload(): ValidateDiffUiPayload {
  return {
    status: 'ok',
    baselineSnapshotId: 'b',
    edges: { added: [], removed: [] },
    nodes: { added: [], removed: [] },
    blastRadius: [],
    violations: { added: [], removed: [] },
    findings: { added: [], removed: [] },
    counts: {
      addedEdges: 0,
      removedEdges: 0,
      newViolations: 0,
      removedViolations: 0,
      newFindings: 0,
      resolvedFindings: 0,
    },
  }
}

describe('createAgentEventsTailer', () => {
  it('broadcasts a valid ValidateDiffUiPayload and skips garbage lines', async () => {
    writeFileSync(logPath, '')
    const broadcast = vi.fn()
    const tailer = createAgentEventsTailer({ projectRoot: tmpRoot, broadcast })
    await tailer.start()
    const payload = makePayload()
    appendFileSync(logPath, `garbage-not-json\n${JSON.stringify(payload)}\n`)
    await waitForCondition(() => broadcast.mock.calls.length >= 1, 2000)
    expect(broadcast).toHaveBeenCalledTimes(1)
    expect(broadcast).toHaveBeenCalledWith({
      type: 'validate:diff',
      payload: expect.objectContaining({ status: 'ok', baselineSnapshotId: 'b' }),
    })
    await tailer.stop()
  })

  it('initial offset = current file size (skips historic entries)', async () => {
    writeFileSync(logPath, `${JSON.stringify(makePayload())}\n`)
    const broadcast = vi.fn()
    const tailer = createAgentEventsTailer({ projectRoot: tmpRoot, broadcast })
    await tailer.start()
    expect(broadcast).not.toHaveBeenCalled()
    await tailer.stop()
  })

  it('broadcasts new appends after start', async () => {
    writeFileSync(logPath, '')
    const broadcast = vi.fn()
    const tailer = createAgentEventsTailer({ projectRoot: tmpRoot, broadcast })
    await tailer.start()
    appendFileSync(logPath, `${JSON.stringify(makePayload())}\n`)
    await waitForCondition(() => broadcast.mock.calls.length >= 1, 2000)
    expect(broadcast).toHaveBeenCalledWith({
      type: 'validate:diff',
      payload: expect.objectContaining({ status: 'ok' }),
    })
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
