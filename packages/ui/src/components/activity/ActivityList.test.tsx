import type { ActivityEntry as Entry } from '@codearch/core'
import { fireEvent, render, screen } from '@testing-library/react'
import { describe, expect, it } from 'vitest'
import { ActivityList } from './ActivityList.js'

function makeEntries(n: number): Entry[] {
  return Array.from({ length: n }, (_, i) => ({
    id: `e${i}`,
    ts: i,
    tool: 't',
    durationMs: 0,
    status: 'ok' as const,
    argsRedacted: '{}',
    redactions: 0,
    truncated: false,
  }))
}
it('renders nothing when entries empty', () => {
  render(<ActivityList entries={[]} />)
  expect(screen.getByText(/no activity/i)).toBeInTheDocument()
})
it('renders all entries when count <= 200', () => {
  render(<ActivityList entries={makeEntries(5)} />)
  expect(screen.getAllByTestId(/activity-entry-/)).toHaveLength(5)
})
it('shows top-200 by default when count > 200', () => {
  render(<ActivityList entries={makeEntries(250)} />)
  expect(screen.getAllByTestId(/activity-entry-/)).toHaveLength(200)
  expect(screen.getByText(/250 total/)).toBeInTheDocument()
})
it('show all toggle reveals full list', () => {
  render(<ActivityList entries={makeEntries(250)} />)
  fireEvent.click(screen.getByRole('button', { name: /show all/i }))
  expect(screen.getAllByTestId(/activity-entry-/)).toHaveLength(250)
})
