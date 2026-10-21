import type { ActivityEntry } from '@codearch/core'
import { beforeEach, describe, expect, it, vi } from 'vitest'
import { useActivityLogStore } from './activity-log.js'
import { useWorkspaceStore } from './workspace.js'

function entry(id: string, ts = 1): ActivityEntry {
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
beforeEach(() => {
  useActivityLogStore.setState({ entries: [], badgeCount: 0, lastSeenTs: 0, isLoading: false })
  useWorkspaceStore.getState().setActiveWorkspace('map')
})
it('loadInitial fetches and replaces entries', async () => {
  const mockFetch = vi.fn().mockResolvedValue({
    ok: true,
    json: async () => ({ entries: [entry('a', 1), entry('b', 2)] }),
  })
  // biome-ignore lint/suspicious/noExplicitAny: test patching
  globalThis.fetch = mockFetch as any
  await useActivityLogStore.getState().loadInitial()
  expect(useActivityLogStore.getState().entries.map((e) => e.id)).toEqual(['a', 'b'])
  expect(useActivityLogStore.getState().lastSeenTs).toBe(2)
})
it('receiveLive appends and increments badge when not on activity tab', () => {
  useActivityLogStore.getState().receiveLive(entry('a', 1))
  expect(useActivityLogStore.getState().badgeCount).toBe(1)
})
it('receiveLive does NOT increment badge when on activity tab', () => {
  useWorkspaceStore.getState().setActiveWorkspace('activity')
  useActivityLogStore.getState().receiveLive(entry('a', 1))
  expect(useActivityLogStore.getState().badgeCount).toBe(0)
  expect(useActivityLogStore.getState().entries).toHaveLength(1)
})
it('receiveLive dedupes by id', () => {
  useActivityLogStore.getState().receiveLive(entry('dup', 1))
  useActivityLogStore.getState().receiveLive(entry('dup', 1))
  expect(useActivityLogStore.getState().entries).toHaveLength(1)
})
it('markRead clears badge', () => {
  useActivityLogStore.setState({ badgeCount: 5 })
  useActivityLogStore.getState().markRead()
  expect(useActivityLogStore.getState().badgeCount).toBe(0)
})
it('entries cap at 500 (oldest dropped)', () => {
  for (let i = 0; i < 510; i++) useActivityLogStore.getState().receiveLive(entry(`e${i}`, i + 1))
  expect(useActivityLogStore.getState().entries).toHaveLength(500)
  // biome-ignore lint/style/noNonNullAssertion: array is guaranteed non-empty after loop
  expect(useActivityLogStore.getState().entries[0]!.id).toBe('e10')
})
