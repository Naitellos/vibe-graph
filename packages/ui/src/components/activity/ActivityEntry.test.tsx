import type { ActivityEntry as ActivityEntryType } from '@codearch/core'
import { fireEvent, render, screen } from '@testing-library/react'
import { describe, expect, it } from 'vitest'
import { ActivityEntry } from './ActivityEntry.js'

const ENTRY: ActivityEntryType = {
  id: '1716919200000-aa',
  ts: 1_716_919_200_000,
  tool: 'prepare_task',
  durationMs: 42,
  status: 'ok',
  summary: 'refactor x · 3 files · 2 rules',
  argsRedacted: '{"intent":"refactor x"}',
  resultRedacted: '{"taskId":"t1"}',
  redactions: 0,
  truncated: false,
}
describe('ActivityEntry', () => {
  it('renders tool, summary, duration, status icon', () => {
    render(<ActivityEntry entry={ENTRY} />)
    expect(screen.getByText('prepare_task')).toBeInTheDocument()
    expect(screen.getByText(/refactor x · 3 files · 2 rules/)).toBeInTheDocument()
    expect(screen.getByText(/42\s*ms/i)).toBeInTheDocument()
  })
  it('collapsed by default — does not show redacted args', () => {
    render(<ActivityEntry entry={ENTRY} />)
    expect(screen.queryByText(/"intent":\s*"refactor x"/)).toBeNull()
  })
  it('click expands → shows argsRedacted + resultRedacted + footer', () => {
    render(<ActivityEntry entry={ENTRY} />)
    fireEvent.click(screen.getByRole('button', { name: /expand|prepare_task/i }))
    expect(screen.getByText(/"intent":\s*"refactor x"/)).toBeInTheDocument()
    expect(screen.getByText(/"taskId":\s*"t1"/)).toBeInTheDocument()
    expect(screen.getByText(/redactions: 0/)).toBeInTheDocument()
    expect(screen.getByText(/truncated: no/)).toBeInTheDocument()
  })
  it('error entry shows errorMessage instead of resultRedacted', () => {
    const err: ActivityEntryType = {
      ...ENTRY,
      status: 'error',
      resultRedacted: undefined,
      errorMessage: 'TARGET_NOT_FOUND',
    }
    render(<ActivityEntry entry={err} />)
    fireEvent.click(screen.getByRole('button', { name: /prepare_task/i }))
    expect(screen.getByText(/TARGET_NOT_FOUND/)).toBeInTheDocument()
  })
  it('shows truncated: yes when entry.truncated', () => {
    render(<ActivityEntry entry={{ ...ENTRY, truncated: true }} />)
    fireEvent.click(screen.getByRole('button', { name: /prepare_task/i }))
    expect(screen.getByText(/truncated: yes/)).toBeInTheDocument()
  })
})
