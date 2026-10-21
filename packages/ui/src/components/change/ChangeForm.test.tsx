import type { Snapshot } from '@codearch/core'
import { act, fireEvent, render, screen } from '@testing-library/react'
import { beforeEach, describe, expect, it, vi } from 'vitest'
import { useChangeModeStore } from '../../state/change-mode.js'
import { ChangeForm } from './ChangeForm.js'

const FIXTURE_SNAPSHOT = {
  // biome-ignore lint/suspicious/noExplicitAny: test fixture
  meta: {} as any,
  nodes: [
    {
      id: 'file:packages/cli/src/bin.ts',
      kind: 'file',
      title: 'bin.ts',
      layer: 'unknown',
      status: 'unknown',
      tags: [],
      files: [],
      metadata: {},
    },
    {
      id: 'file:packages/cli/src/init.ts',
      kind: 'file',
      title: 'init.ts',
      layer: 'unknown',
      status: 'unknown',
      tags: [],
      files: [],
      metadata: {},
    },
    {
      id: 'subsystem:cli',
      kind: 'subsystem',
      title: 'cli',
      layer: 'horizontal',
      status: 'unknown',
      tags: [],
      files: [],
      metadata: {},
    },
  ],
  edges: [],
  findings: [],
} as unknown as Snapshot

vi.mock('../../state/snapshot.js', () => ({
  useSnapshot: () => ({ data: FIXTURE_SNAPSHOT, isLoading: false, error: null }),
}))

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
describe('ChangeForm', () => {
  it('Submit disabled when intent empty', () => {
    render(<ChangeForm />)
    expect(screen.getByRole('button', { name: /submit|prepare/i })).toBeDisabled()
  })
  it('Submit disabled when no paths selected', () => {
    render(<ChangeForm />)
    fireEvent.change(screen.getByPlaceholderText(/intent|describe/i), {
      target: { value: 'refactor x' },
    })
    expect(screen.getByRole('button', { name: /submit|prepare/i })).toBeDisabled()
  })
  it('autocomplete shows file suggestions on type', () => {
    render(<ChangeForm />)
    fireEvent.change(screen.getByPlaceholderText(/add path/i), { target: { value: 'bin' } })
    expect(screen.getByText(/bin\.ts/)).toBeInTheDocument()
  })
  it('click suggestion adds chip + clears input', () => {
    render(<ChangeForm />)
    const input = screen.getByPlaceholderText(/add path/i)
    fireEvent.change(input, { target: { value: 'bin' } })
    fireEvent.click(screen.getByText('packages/cli/src/bin.ts'))
    expect(screen.getByText(/×/i)).toBeInTheDocument()
    expect((input as HTMLInputElement).value).toBe('')
  })
  it('Submit fires store.submit() when valid', () => {
    const submitSpy = vi.spyOn(useChangeModeStore.getState(), 'submit').mockResolvedValue()
    render(<ChangeForm />)
    fireEvent.change(screen.getByPlaceholderText(/intent|describe/i), { target: { value: 'x' } })
    act(() => {
      useChangeModeStore.setState({ paths: ['packages/cli/src/bin.ts'] })
    })
    fireEvent.click(screen.getByRole('button', { name: /submit|prepare/i }))
    expect(submitSpy).toHaveBeenCalled()
  })
})
