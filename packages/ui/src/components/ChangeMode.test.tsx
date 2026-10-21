import type { PrepareTaskOutput, Snapshot } from '@codearch/core'
import { render, screen } from '@testing-library/react'
import { beforeEach, expect, it, vi } from 'vitest'
import { useChangeModeStore } from '../state/change-mode.js'
import { ChangeMode } from './ChangeMode.js'

// biome-ignore lint/suspicious/noExplicitAny: test fixture
const SNAPSHOT = { meta: {} as any, nodes: [], edges: [], findings: [] } as unknown as Snapshot
vi.mock('../state/snapshot.js', () => ({ useSnapshot: () => ({ data: SNAPSHOT }) }))

beforeEach(() => {
  useChangeModeStore.setState({
    intent: '',
    paths: [],
    mode: 'refactor',
    preparedTask: null,
    lastSubmittedInput: null,
    status: 'idle',
    error: null,
  })
})
it('renders form when no preparedTask', () => {
  render(<ChangeMode />)
  expect(screen.getByPlaceholderText(/intent/i)).toBeInTheDocument()
})
it('renders error banner when status=error', () => {
  useChangeModeStore.setState({ status: 'error', error: 'no snapshot' })
  render(<ChangeMode />)
  expect(screen.getByText(/no snapshot/i)).toBeInTheDocument()
})
it('renders PreparedTaskView + ExitBar when preparedTask present', () => {
  const fake: PrepareTaskOutput = {
    taskId: 't1',
    createdAt: '2026-05-28T00:00:00.000Z',
    target: { subsystems: ['x'], files: ['a.ts'] },
    summary: 's',
    risks: [],
    rules: [],
    doNotDo: [],
    requiredContext: { files: [], schemaTables: [], relatedAdrs: [] },
    recommendations: [],
    tests: [],
    baselineSnapshotId: 'b',
  }
  useChangeModeStore.setState({
    preparedTask: fake,
    lastSubmittedInput: { intent: 'x', paths: ['a.ts'], mode: 'refactor' },
  })
  render(<ChangeMode />)
  expect(screen.getByText('Target')).toBeInTheDocument()
  expect(screen.getByRole('button', { name: /copy as markdown/i })).toBeInTheDocument()
})
