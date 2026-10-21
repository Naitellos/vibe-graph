import type { ActivityEntry as Entry } from '@codearch/core'
import { render, screen, waitFor } from '@testing-library/react'
import { beforeEach, describe, expect, it, vi } from 'vitest'
import { useActivityLogStore } from '../state/activity-log.js'
import { ActivityLog } from './ActivityLog.js'

function entry(id: string, ts: number): Entry {
  return {
    id,
    ts,
    tool: 'prepare_task',
    durationMs: 10,
    status: 'ok',
    argsRedacted: '{}',
    redactions: 0,
    truncated: false,
  }
}
beforeEach(() => {
  useActivityLogStore.setState({ entries: [], badgeCount: 0, lastSeenTs: 0, isLoading: false })
})
it('calls loadInitial on mount', async () => {
  const fetchMock = vi
    .fn()
    .mockResolvedValue({ ok: true, json: async () => ({ entries: [entry('a', 1)] }) })
  // biome-ignore lint/suspicious/noExplicitAny: test patching
  globalThis.fetch = fetchMock as any
  render(<ActivityLog />)
  await waitFor(() => {
    expect(fetchMock).toHaveBeenCalledWith(expect.stringContaining('/api/agent-activity'))
  })
})
it('renders entries from store', () => {
  useActivityLogStore.setState({ entries: [entry('a', 1), entry('b', 2)] })
  render(<ActivityLog />)
  expect(screen.getAllByTestId(/activity-entry-/)).toHaveLength(2)
})
it('renders header showing count', () => {
  useActivityLogStore.setState({ entries: [entry('a', Date.now() - 5000)] })
  render(<ActivityLog />)
  expect(screen.getByText(/1 entr/i)).toBeInTheDocument()
})
