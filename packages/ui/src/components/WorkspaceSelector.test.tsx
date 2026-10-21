import { fireEvent, render, screen } from '@testing-library/react'
import { userEvent } from '@testing-library/user-event'
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import { useActivityLogStore } from '../state/activity-log.js'
import { useDiffStore } from '../state/diff.js'
import { useWorkspaceStore } from '../state/workspace.js'
import { WorkspaceSelector } from './WorkspaceSelector.js'

beforeEach(() => {
  useWorkspaceStore.setState({ activeWorkspace: 'map' })
  useActivityLogStore.setState({ entries: [], badgeCount: 0, lastSeenTs: 0, isLoading: false })
  useDiffStore.setState({ status: 'idle' })
})

afterEach(() => {
  useWorkspaceStore.setState({ activeWorkspace: 'map' })
  useActivityLogStore.setState({ entries: [], badgeCount: 0, lastSeenTs: 0, isLoading: false })
  useDiffStore.setState({ status: 'idle' })
  vi.restoreAllMocks()
})

describe('WorkspaceSelector', () => {
  describe('rendering', () => {
    it('renders all 6 workspace buttons', () => {
      render(<WorkspaceSelector />)
      expect(screen.getByRole('button', { name: /map/i })).toBeInTheDocument()
      expect(screen.getByRole('button', { name: /change/i })).toBeInTheDocument()
      expect(screen.getByRole('button', { name: /activity/i })).toBeInTheDocument()
      expect(screen.getByRole('button', { name: /flow/i })).toBeInTheDocument()
      expect(screen.getByRole('button', { name: /security/i })).toBeInTheDocument()
      expect(screen.getByRole('button', { name: /overview/i })).toBeInTheDocument()
    })

    it('Map button has data-active="true" by default', () => {
      render(<WorkspaceSelector />)
      expect(screen.getByRole('button', { name: /map/i })).toHaveAttribute('data-active', 'true')
    })

    it('Flow button does not have data-active="true" by default', () => {
      render(<WorkspaceSelector />)
      expect(screen.getByRole('button', { name: /flow/i })).not.toHaveAttribute(
        'data-active',
        'true',
      )
    })
  })

  describe('disabled buttons', () => {
    it('Flow button is disabled', () => {
      render(<WorkspaceSelector />)
      expect(screen.getByRole('button', { name: /flow/i })).toBeDisabled()
    })

    it('Security button is disabled', () => {
      render(<WorkspaceSelector />)
      expect(screen.getByRole('button', { name: /security/i })).toBeDisabled()
    })

    it('Overview button is disabled', () => {
      render(<WorkspaceSelector />)
      expect(screen.getByRole('button', { name: /overview/i })).toBeDisabled()
    })

    it('Flow button has aria-disabled="true"', () => {
      render(<WorkspaceSelector />)
      expect(screen.getByRole('button', { name: /flow/i })).toHaveAttribute('aria-disabled', 'true')
    })

    it('Security button has aria-disabled="true"', () => {
      render(<WorkspaceSelector />)
      expect(screen.getByRole('button', { name: /security/i })).toHaveAttribute(
        'aria-disabled',
        'true',
      )
    })

    it('Overview button has aria-disabled="true"', () => {
      render(<WorkspaceSelector />)
      expect(screen.getByRole('button', { name: /overview/i })).toHaveAttribute(
        'aria-disabled',
        'true',
      )
    })

    it('Flow button has title="Coming soon"', () => {
      render(<WorkspaceSelector />)
      expect(screen.getByRole('button', { name: /flow/i })).toHaveAttribute('title', 'Coming soon')
    })

    it('Security button has title="Coming soon"', () => {
      render(<WorkspaceSelector />)
      expect(screen.getByRole('button', { name: /security/i })).toHaveAttribute(
        'title',
        'Coming soon',
      )
    })

    it('Overview button has title="Coming soon"', () => {
      render(<WorkspaceSelector />)
      expect(screen.getByRole('button', { name: /overview/i })).toHaveAttribute(
        'title',
        'Coming soon',
      )
    })
  })

  describe('Map button interaction', () => {
    it('clicking Map again does not cause an error', async () => {
      const user = userEvent.setup()
      render(<WorkspaceSelector />)
      await user.click(screen.getByRole('button', { name: /map/i }))
      expect(useWorkspaceStore.getState().activeWorkspace).toBe('map')
    })
  })

  describe('disabled button state change prevention', () => {
    it('clicking Flow does not change activeWorkspace', async () => {
      const user = userEvent.setup()
      render(<WorkspaceSelector />)
      // Disabled buttons don't fire click events in userEvent — this confirms no state change
      await user.click(screen.getByRole('button', { name: /flow/i }))
      expect(useWorkspaceStore.getState().activeWorkspace).toBe('map')
    })

    it('clicking Security does not change activeWorkspace', async () => {
      const user = userEvent.setup()
      render(<WorkspaceSelector />)
      await user.click(screen.getByRole('button', { name: /security/i }))
      expect(useWorkspaceStore.getState().activeWorkspace).toBe('map')
    })

    it('clicking Overview does not change activeWorkspace', async () => {
      const user = userEvent.setup()
      render(<WorkspaceSelector />)
      await user.click(screen.getByRole('button', { name: /overview/i }))
      expect(useWorkspaceStore.getState().activeWorkspace).toBe('map')
    })
  })

  describe('Change button', () => {
    it('renders Change button, click switches workspace', () => {
      render(<WorkspaceSelector />)
      const btn = screen.getByRole('button', { name: /change/i })
      expect(btn).not.toBeDisabled()
      fireEvent.click(btn)
      expect(useWorkspaceStore.getState().activeWorkspace).toBe('change')
    })
  })

  describe('Activity button', () => {
    it('renders Activity button + badge when badgeCount > 0', () => {
      useActivityLogStore.setState({ badgeCount: 7 })
      render(<WorkspaceSelector />)
      expect(screen.getByRole('button', { name: /activity/i })).toBeInTheDocument()
      expect(screen.getByText('7')).toBeInTheDocument()
    })

    it('click on Activity calls markRead', () => {
      useActivityLogStore.setState({ badgeCount: 3 })
      render(<WorkspaceSelector />)
      fireEvent.click(screen.getByRole('button', { name: /activity/i }))
      expect(useActivityLogStore.getState().badgeCount).toBe(0)
    })

    it('Flow / Security / Overview stay disabled', () => {
      render(<WorkspaceSelector />)
      expect(screen.getByRole('button', { name: /flow/i })).toBeDisabled()
      expect(screen.getByRole('button', { name: /security/i })).toBeDisabled()
      expect(screen.getByRole('button', { name: /overview/i })).toBeDisabled()
    })
  })

  describe('Validate button', () => {
    it('renders a Validate button with data-testid="validate-btn"', () => {
      render(<WorkspaceSelector />)
      expect(screen.getByTestId('validate-btn')).toBeInTheDocument()
    })

    it('Validate button shows "Validate" label when idle', () => {
      render(<WorkspaceSelector />)
      expect(screen.getByTestId('validate-btn')).toHaveTextContent('Validate')
    })

    it('Validate button shows "Validating…" and is disabled when status=loading', () => {
      useDiffStore.setState({ status: 'loading' })
      render(<WorkspaceSelector />)
      const btn = screen.getByTestId('validate-btn')
      expect(btn).toBeDisabled()
      expect(btn).toHaveTextContent('Validating…')
    })

    it('clicking Validate invokes runValidate on useDiffStore', async () => {
      const user = userEvent.setup()
      const spy = vi.spyOn(useDiffStore.getState(), 'runValidate').mockResolvedValue(undefined)
      render(<WorkspaceSelector />)
      await user.click(screen.getByTestId('validate-btn'))
      expect(spy).toHaveBeenCalledTimes(1)
    })

    it('clicking Validate passes taskId from preparedTask when available', async () => {
      const user = userEvent.setup()
      const spy = vi.spyOn(useDiffStore.getState(), 'runValidate').mockResolvedValue(undefined)
      // Set a prepared task in change-mode store
      const { useChangeModeStore } = await import('../state/change-mode.js')
      useChangeModeStore.setState({
        preparedTask: {
          taskId: 'task-123',
          createdAt: '2024-01-01T00:00:00.000Z',
          target: { subsystems: [], files: [] },
          summary: 'test',
          risks: [],
          rules: [],
          doNotDo: [],
          requiredContext: { files: [], schemaTables: [], relatedAdrs: [] },
          recommendations: [],
          tests: [],
          baselineSnapshotId: 'snap-1',
        },
      })
      render(<WorkspaceSelector />)
      await user.click(screen.getByTestId('validate-btn'))
      expect(spy).toHaveBeenCalledWith({ taskId: 'task-123' })
      useChangeModeStore.setState({ preparedTask: null })
    })

    it('clicking Validate passes undefined taskId when no preparedTask', async () => {
      const user = userEvent.setup()
      const spy = vi.spyOn(useDiffStore.getState(), 'runValidate').mockResolvedValue(undefined)
      render(<WorkspaceSelector />)
      await user.click(screen.getByTestId('validate-btn'))
      expect(spy).toHaveBeenCalledWith({ taskId: undefined })
    })

    it('switches to map workspace on successful validate (active:true)', async () => {
      const user = userEvent.setup()
      useWorkspaceStore.setState({ activeWorkspace: 'change' })
      vi.spyOn(useDiffStore.getState(), 'runValidate').mockImplementation(async () => {
        useDiffStore.setState({ active: true })
      })
      render(<WorkspaceSelector />)
      await user.click(screen.getByTestId('validate-btn'))
      expect(useWorkspaceStore.getState().activeWorkspace).toBe('map')
    })

    it('does NOT switch workspace on failed validate (active:false)', async () => {
      const user = userEvent.setup()
      useWorkspaceStore.setState({ activeWorkspace: 'change' })
      vi.spyOn(useDiffStore.getState(), 'runValidate').mockImplementation(async () => {
        useDiffStore.setState({ active: false, status: 'error', error: 'NO_BASELINE' })
      })
      render(<WorkspaceSelector />)
      await user.click(screen.getByTestId('validate-btn'))
      expect(useWorkspaceStore.getState().activeWorkspace).toBe('change')
    })
  })
})
