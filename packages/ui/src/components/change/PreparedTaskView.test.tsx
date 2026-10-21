import type { PrepareTaskInput, PrepareTaskOutput } from '@codearch/core'
import { render, screen } from '@testing-library/react'
import { expect, it } from 'vitest'
import { PreparedTaskView } from './PreparedTaskView.js'

const INPUT: PrepareTaskInput = { intent: 'refactor x', paths: ['a.ts'], mode: 'refactor' }
const OUTPUT: PrepareTaskOutput = {
  taskId: 't1',
  createdAt: '2026-05-28T00:00:00.000Z',
  target: { subsystems: ['core'], files: ['a.ts'] },
  summary: 'Working on core (0 transitive dependents, 1 active findings).',
  risks: [{ severity: 'high', title: 'Cycle', involvedNodeIds: ['subsystem:core'] }],
  rules: [{ id: 'r1', title: 'No new orphans', severity: 'medium', mode: 'warn' }],
  doNotDo: ['Do not add files outside any subsystem.match glob'],
  requiredContext: { files: ['a.ts', 'b.ts'], schemaTables: [], relatedAdrs: [] },
  recommendations: ['Address 1 active finding(s) before editing.'],
  tests: ['a.test.ts'],
  baselineSnapshotId: 'snap1',
}

it('renders all 6 section titles', () => {
  render(<PreparedTaskView input={INPUT} output={OUTPUT} />)
  for (const title of [
    'Target',
    'Active Risks',
    'Applicable Rules',
    'Do Not Do',
    'Required Context',
    'Recommendations / Tests',
  ]) {
    expect(screen.getByText(title)).toBeInTheDocument()
  }
})

it('renders empty state for empty section', () => {
  const empty: PrepareTaskOutput = { ...OUTPUT, rules: [], doNotDo: [] }
  render(<PreparedTaskView input={INPUT} output={empty} />)
  expect(screen.getByText(/No applicable rules/i)).toBeInTheDocument()
})

it('shows summary inside Target', () => {
  render(<PreparedTaskView input={INPUT} output={OUTPUT} />)
  expect(screen.getByText(/Working on core/)).toBeInTheDocument()
})
