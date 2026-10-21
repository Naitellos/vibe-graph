import type { PrepareTaskInput, PrepareTaskOutput } from '@codearch/core'
import { act, fireEvent, render, screen } from '@testing-library/react'
import { describe, expect, it, vi } from 'vitest'
import { ChangeExitBar, renderMarkdown } from './ChangeExitBar.js'

const INPUT: PrepareTaskInput = { intent: 'refactor x', paths: ['a.ts'], mode: 'refactor' }
const OUTPUT: PrepareTaskOutput = {
  taskId: 't1',
  createdAt: '2026-05-28T00:00:00.000Z',
  target: { subsystems: ['core'], files: ['a.ts'] },
  summary: 'sum',
  risks: [],
  rules: [],
  doNotDo: [],
  requiredContext: { files: ['a.ts'], schemaTables: [], relatedAdrs: [] },
  recommendations: [],
  tests: [],
  baselineSnapshotId: 'snap1',
}
describe('renderMarkdown', () => {
  it('starts with # heading containing intent + mode', () => {
    const md = renderMarkdown(INPUT, OUTPUT)
    expect(md).toMatch(/^# /m)
    expect(md).toContain('refactor x')
    expect(md).toContain('refactor')
  })
  it('includes a section for each PrepareTaskOutput field', () => {
    const md = renderMarkdown(INPUT, OUTPUT)
    expect(md).toContain('## Target')
    expect(md).toContain('## Required Context')
  })
  it('includes Task ID for validate_diff', () => {
    const md = renderMarkdown(INPUT, OUTPUT)
    expect(md).toContain(OUTPUT.taskId)
    expect(md).toMatch(/Task ID/i)
  })
})
describe('ChangeExitBar', () => {
  it('copies markdown to clipboard on click', async () => {
    const writeText = vi.fn().mockResolvedValue(undefined)
    Object.defineProperty(globalThis.navigator, 'clipboard', {
      value: { writeText },
      configurable: true,
    })
    render(<ChangeExitBar input={INPUT} output={OUTPUT} />)
    await act(async () => {
      fireEvent.click(screen.getByRole('button', { name: /copy as markdown/i }))
    })
    expect(writeText).toHaveBeenCalledTimes(1)
    expect(writeText.mock.calls[0]?.[0]).toContain('# ')
  })
  it('copies json on click', async () => {
    const writeText = vi.fn().mockResolvedValue(undefined)
    Object.defineProperty(globalThis.navigator, 'clipboard', {
      value: { writeText },
      configurable: true,
    })
    render(<ChangeExitBar input={INPUT} output={OUTPUT} />)
    await act(async () => {
      fireEvent.click(screen.getByRole('button', { name: /copy json/i }))
    })
    expect(() => JSON.parse(writeText.mock.calls[0]?.[0] as string)).not.toThrow()
  })
  it('shows local "✓ Copied" indicator after click', async () => {
    Object.defineProperty(globalThis.navigator, 'clipboard', {
      value: { writeText: vi.fn().mockResolvedValue(undefined) },
      configurable: true,
    })
    render(<ChangeExitBar input={INPUT} output={OUTPUT} />)
    await act(async () => {
      fireEvent.click(screen.getByRole('button', { name: /copy as markdown/i }))
    })
    expect(screen.getByText(/copied/i)).toBeInTheDocument()
  })
})
