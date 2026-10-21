/**
 * Unit tests for scan-watch debounce logic.
 *
 * E2E watch tests are intentionally omitted: spawning a long-running watch process
 * in the test runner (send SIGINT, await output, handle cleanup) is fragile and
 * adds significant complexity for marginal coverage. The controller.triggerChange +
 * recording-logger approach here verifies the core requirement — 3 rapid triggers
 * → exactly 1 rescan — without filesystem overhead.
 */

import { mkdirSync, mkdtempSync, realpathSync, writeFileSync } from 'node:fs'
import { tmpdir } from 'node:os'
import { dirname, join } from 'node:path'
import type { FSWatcher } from 'chokidar'
import type { Logger } from 'pino'
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import { runWatchScan } from './scan-watch.js'

// ---------------------------------------------------------------------------
// Helpers
// ---------------------------------------------------------------------------

function mkTmp(): string {
  return realpathSync(mkdtempSync(join(tmpdir(), 'vg-cli-watch-')))
}

function touch(root: string, relPath: string, body = ''): void {
  const abs = join(root, relPath)
  mkdirSync(dirname(abs), { recursive: true })
  writeFileSync(abs, body)
}

function setupFixture(): string {
  const root = mkTmp()
  writeFileSync(join(root, 'package.json'), JSON.stringify({ name: 'watch-test' }))
  writeFileSync(
    join(root, 'tsconfig.json'),
    JSON.stringify({
      compilerOptions: {
        strict: true,
        target: 'ES2022',
        module: 'NodeNext',
        moduleResolution: 'NodeNext',
      },
      include: ['src/**/*'],
    }),
  )
  touch(root, 'src/a.ts', 'export const a = 1\n')
  return root
}

/** No-op stub watcher — satisfies the FSWatcher interface without touching real FS. */
function makeStubWatcher(): FSWatcher {
  return {
    on: () => ({}) as FSWatcher,
    off: () => ({}) as FSWatcher,
    close: async () => undefined,
  } as unknown as FSWatcher
}

/**
 * Wait for at least one log record matching `event` to appear after `startLen`.
 * Polls every 25ms with a 10s ceiling. Replaces a previous fixed-3s sleep that
 * was the single largest contributor to local test suite wall-time (~9s across
 * 3 tests). Real scan completes in ~200–500ms on the tiny fixture; polling
 * lets the test finish as soon as the work is actually done.
 */
async function waitForLogEvent(
  records: Array<{ event?: string; msg: string }>,
  event: string,
  startLen: number,
  ceilingMs = 10_000,
): Promise<void> {
  const startedAt = Date.now()
  while (Date.now() - startedAt < ceilingMs) {
    if (records.slice(startLen).some((r) => r.event === event)) return
    await new Promise<void>((resolve) => setTimeout(resolve, 25))
  }
  throw new Error(`waitForLogEvent: did not see event=${event} within ${ceilingMs}ms`)
}

/** Recording logger: captures info-level structured fields for assertion. */
function makeRecordingLogger(): { log: Logger; records: Array<{ event?: string; msg: string }> } {
  const records: Array<{ event?: string; msg: string }> = []
  const log = {
    info: (objOrMsg: unknown, msg?: string) => {
      if (typeof objOrMsg === 'object' && objOrMsg !== null) {
        const obj = objOrMsg as { event?: string }
        records.push({ event: obj.event, msg: msg ?? '' })
      } else {
        records.push({ msg: String(objOrMsg) })
      }
    },
    warn: () => {},
    error: () => {},
    debug: () => {},
    fatal: () => {},
    trace: () => {},
    level: 'info',
    child: () => log,
  } as unknown as Logger
  return { log, records }
}

// ---------------------------------------------------------------------------
// Tests
// ---------------------------------------------------------------------------

describe('runWatchScan debounce', () => {
  beforeEach(() => {
    vi.useFakeTimers()
  })

  afterEach(() => {
    vi.useRealTimers()
  })

  it('3 rapid triggerChange calls produce exactly 1 rescan event', async () => {
    const root = setupFixture()
    const { log, records } = makeRecordingLogger()

    // Build the controller — initial scan runs during construction.
    // We need to let that complete with real timers, then switch to fake timers.
    vi.useRealTimers()
    const controller = await runWatchScan({
      root,
      log,
      debounceMs: 100,
      watcherFactory: makeStubWatcher,
    })
    vi.useFakeTimers()

    // Clear records from initial-scan logs so we only count subsequent rescans
    const startLen = records.length

    // Fire 3 rapid changes within the debounce window
    controller.triggerChange('src/a.ts')
    controller.triggerChange('src/a.ts')
    controller.triggerChange('src/a.ts')

    // Advance past the debounce threshold
    await vi.advanceTimersByTimeAsync(150)

    // Switch back to real timers and poll for the rescan log event (was a
    // fixed 3s sleep; polling finishes in ~200–500ms when the work is done)
    vi.useRealTimers()
    await waitForLogEvent(records, 'watch:rescan', startLen)

    await controller.stop()

    const rescans = records.slice(startLen).filter((r) => r.event === 'watch:rescan')
    expect(rescans.length).toBe(1)
  }, 60_000)

  it('debounce window resets on each triggerChange — late triggers still coalesce', async () => {
    const root = setupFixture()
    const { log, records } = makeRecordingLogger()

    vi.useRealTimers()
    const controller = await runWatchScan({
      root,
      log,
      debounceMs: 100,
      watcherFactory: makeStubWatcher,
    })
    vi.useFakeTimers()

    const startLen = records.length

    // Trigger at t=0, t=50ms, t=100ms, t=150ms — each one resets the timer.
    // The 5th trigger at t=250ms is 100ms after the 4th, so only ONE rescan fires
    // after t=250ms+100ms = t=350ms.
    controller.triggerChange('src/a.ts') // t=0
    await vi.advanceTimersByTimeAsync(50)
    controller.triggerChange('src/a.ts') // t=50
    await vi.advanceTimersByTimeAsync(50)
    controller.triggerChange('src/a.ts') // t=100
    await vi.advanceTimersByTimeAsync(50)
    controller.triggerChange('src/a.ts') // t=150 — resets again
    // Advance past the final debounce window
    await vi.advanceTimersByTimeAsync(150)

    vi.useRealTimers()
    await waitForLogEvent(records, 'watch:rescan', startLen)

    await controller.stop()

    const rescans = records.slice(startLen).filter((r) => r.event === 'watch:rescan')
    expect(rescans.length).toBe(1)
  }, 60_000)

  it('changesCollected in the rescan log reflects all batched triggers', async () => {
    const root = setupFixture()
    const { log, records } = makeRecordingLogger()

    vi.useRealTimers()
    const controller = await runWatchScan({
      root,
      log,
      debounceMs: 100,
      watcherFactory: makeStubWatcher,
    })
    vi.useFakeTimers()

    const startLen = records.length

    controller.triggerChange('src/a.ts')
    controller.triggerChange('src/b.ts')
    controller.triggerChange('src/c.ts')

    await vi.advanceTimersByTimeAsync(150)

    vi.useRealTimers()
    await waitForLogEvent(records, 'watch:rescan', startLen)

    await controller.stop()

    const rescanRecords = records.slice(startLen).filter((r) => r.event === 'watch:rescan')
    expect(rescanRecords.length).toBe(1)
    // changesCollected should be recorded in the log object — verify via msg content
    expect(rescanRecords[0].msg).toMatch(/3 change/)
  }, 60_000)
})
