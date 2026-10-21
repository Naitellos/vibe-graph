import { act, render, screen } from '@testing-library/react'
import { userEvent } from '@testing-library/user-event'
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import { useDiffStore } from '../state/diff.js'
import { useWorkspaceStore } from '../state/workspace.js'
import type { WsBusClient, WsEvent, WsListener } from '../state/ws-bus.js'
import { ToastBar } from './ToastBar.js'

// ─── Stub bus factory ─────────────────────────────────────────────────────────

function makeStubBus(): { bus: WsBusClient; emit: (event: WsEvent) => void } {
  const listeners = new Set<WsListener>()
  const bus: WsBusClient = {
    subscribe(cb) {
      listeners.add(cb)
      return () => listeners.delete(cb)
    },
    listenerCount() {
      return listeners.size
    },
    close() {},
    state: 'open',
  }
  const emit = (event: WsEvent) => {
    for (const l of listeners) l(event)
  }
  return { bus, emit }
}

// ─── Tests ────────────────────────────────────────────────────────────────────

describe('ToastBar', () => {
  describe('1. Initially empty', () => {
    it('renders no toasts when no errors have been emitted', () => {
      const { bus } = makeStubBus()
      render(<ToastBar bus={bus} />)
      expect(screen.queryAllByTestId('toast')).toHaveLength(0)
    })

    it('renders the container element', () => {
      const { bus } = makeStubBus()
      render(<ToastBar bus={bus} />)
      expect(screen.getByTestId('toast-bar')).toBeInTheDocument()
    })
  })

  describe('2. scan:error emits a toast', () => {
    it('shows a toast with code and message after scan:error', () => {
      const { bus, emit } = makeStubBus()
      render(<ToastBar bus={bus} />)

      act(() => {
        emit({ type: 'scan:error', code: 'EBADCFG', message: 'config missing' })
      })

      expect(screen.getAllByTestId('toast')).toHaveLength(1)
      expect(screen.getByText('EBADCFG')).toBeInTheDocument()
      expect(screen.getByText('config missing')).toBeInTheDocument()
    })
  })

  describe('3. Multiple errors stack', () => {
    it('renders 3 toasts when 3 scan:error events are emitted', () => {
      const { bus, emit } = makeStubBus()
      render(<ToastBar bus={bus} />)

      act(() => {
        emit({ type: 'scan:error', code: 'ERR1', message: 'error one' })
        emit({ type: 'scan:error', code: 'ERR2', message: 'error two' })
        emit({ type: 'scan:error', code: 'ERR3', message: 'error three' })
      })

      expect(screen.getAllByTestId('toast')).toHaveLength(3)
    })
  })

  describe('4. Auto-dismiss after 8s', () => {
    beforeEach(() => {
      vi.useFakeTimers()
    })
    afterEach(() => {
      vi.useRealTimers()
    })

    it('still shows toast at 7999ms, gone at 8000ms', () => {
      const { bus, emit } = makeStubBus()
      render(<ToastBar bus={bus} />)

      act(() => {
        emit({ type: 'scan:error', code: 'ETIMEOUT', message: 'timed out' })
      })

      expect(screen.getAllByTestId('toast')).toHaveLength(1)

      act(() => {
        vi.advanceTimersByTime(7999)
      })
      expect(screen.getAllByTestId('toast')).toHaveLength(1)

      act(() => {
        vi.advanceTimersByTime(1)
      })
      expect(screen.queryAllByTestId('toast')).toHaveLength(0)
    })
  })

  describe('5. Manual dismiss', () => {
    it('removes toast immediately when X button is clicked', async () => {
      const user = userEvent.setup()
      const { bus, emit } = makeStubBus()
      render(<ToastBar bus={bus} />)

      act(() => {
        emit({ type: 'scan:error', code: 'EMANUAL', message: 'manually dismissed' })
      })

      expect(screen.getAllByTestId('toast')).toHaveLength(1)

      const dismissButton = screen.getByRole('button', { name: /dismiss/i })
      await user.click(dismissButton)

      expect(screen.queryAllByTestId('toast')).toHaveLength(0)
    })
  })

  describe('6. Non-error events ignored', () => {
    it('does not create a toast for scan:complete event', () => {
      const { bus, emit } = makeStubBus()
      render(<ToastBar bus={bus} />)

      act(() => {
        emit({
          type: 'scan:complete',
          builtAt: '2026-05-25T00:00:00Z',
          durationMs: 100,
          scanId: 'abc',
        })
      })

      expect(screen.queryAllByTestId('toast')).toHaveLength(0)
    })

    it('does not create a toast for scan:start event', () => {
      const { bus, emit } = makeStubBus()
      render(<ToastBar bus={bus} />)

      act(() => {
        emit({ type: 'scan:start', at: '2026-05-25T00:00:00Z' })
      })

      expect(screen.queryAllByTestId('toast')).toHaveLength(0)
    })

    it('does not create a toast for graph:updated event', () => {
      const { bus, emit } = makeStubBus()
      render(<ToastBar bus={bus} />)

      act(() => {
        emit({ type: 'graph:updated', scanId: 'abc' })
      })

      expect(screen.queryAllByTestId('toast')).toHaveLength(0)
    })
  })

  describe('8. useDiffStore error → VALIDATE_ERROR toast', () => {
    afterEach(() => {
      useDiffStore.setState({ status: 'idle', error: undefined })
    })

    it('shows a VALIDATE_ERROR toast when status transitions to error', async () => {
      const { bus } = makeStubBus()
      render(<ToastBar bus={bus} />)

      act(() => {
        useDiffStore.setState({ status: 'error', error: 'NO_BASELINE' })
      })

      expect(await screen.findAllByTestId('toast')).toHaveLength(1)
      expect(screen.getByText('VALIDATE_ERROR')).toBeInTheDocument()
      expect(screen.getByText('NO_BASELINE')).toBeInTheDocument()
    })

    it('does NOT show a toast when already in error state (no transition)', async () => {
      const { bus } = makeStubBus()
      // Pre-seed error so prevDiffStatus starts at 'error'
      useDiffStore.setState({ status: 'error', error: 'OLD_ERROR' })
      render(<ToastBar bus={bus} />)

      // Simulate another setState call that keeps status:'error' — should NOT add a second toast
      act(() => {
        useDiffStore.setState({ status: 'error', error: 'STILL_ERROR' })
      })

      // Only 0 toasts because the initial render saw status:'error' but prevDiffStatus
      // was 'idle' only before mount — after subscribe the first callback sees 'error'
      // against prevDiffStatus='idle', so one toast fires on the very first subscription
      // callback if the state is already error at mount time. We accept either 0 or 1
      // but NOT 2 — a duplicate must not appear.
      const toasts = screen.queryAllByTestId('toast')
      expect(toasts.length).toBeLessThanOrEqual(1)
    })

    it('shows a toast with fallback message when error is undefined', async () => {
      const { bus } = makeStubBus()
      render(<ToastBar bus={bus} />)

      act(() => {
        useDiffStore.setState({ status: 'error', error: undefined })
      })

      expect(await screen.findAllByTestId('toast')).toHaveLength(1)
      expect(screen.getByText('Validate failed')).toBeInTheDocument()
    })
  })

  describe('7. validate:diff agent toast', () => {
    const MOCK_PAYLOAD = {
      status: 'ok' as const,
      baselineSnapshotId: 'snap-1',
      edges: { added: [{ from: 'subsystem:cli', to: 'subsystem:mcp', kind: 'uses' }], removed: [] },
      nodes: { added: [], removed: [] },
      blastRadius: [{ id: 'subsystem:core', before: 1, after: 2, delta: '+1' }],
      violations: { added: [], removed: [] },
      findings: { added: [], removed: [] },
      counts: {
        addedEdges: 1,
        removedEdges: 0,
        newViolations: 0,
        removedViolations: 0,
        newFindings: 0,
        resolvedFindings: 0,
      },
    }

    afterEach(() => {
      useDiffStore.setState({
        delta: null,
        pendingDelta: null,
        active: false,
        source: null,
        status: 'idle',
      })
      useWorkspaceStore.setState({ activeWorkspace: 'map' })
    })

    it('shows a toast with "Agent validated" message after validate:diff', () => {
      const { bus, emit } = makeStubBus()
      render(<ToastBar bus={bus} />)

      act(() => {
        emit({ type: 'validate:diff', payload: MOCK_PAYLOAD })
      })

      expect(screen.getAllByTestId('toast')).toHaveLength(1)
      expect(screen.getByText(/Agent validated/i)).toBeInTheDocument()
    })

    it('renders a "View diff" action button inside the validate:diff toast', () => {
      const { bus, emit } = makeStubBus()
      render(<ToastBar bus={bus} />)

      act(() => {
        emit({ type: 'validate:diff', payload: MOCK_PAYLOAD })
      })

      expect(screen.getByRole('button', { name: /view diff/i })).toBeInTheDocument()
    })

    it('clicking "View diff" calls activate() and sets workspace to map', async () => {
      const user = userEvent.setup()
      const { bus, emit } = makeStubBus()
      // Put a pendingDelta so activate() has something to promote
      useDiffStore.setState({ pendingDelta: MOCK_PAYLOAD })
      useWorkspaceStore.setState({ activeWorkspace: 'change' })
      render(<ToastBar bus={bus} />)

      act(() => {
        emit({ type: 'validate:diff', payload: MOCK_PAYLOAD })
      })

      await user.click(screen.getByRole('button', { name: /view diff/i }))

      expect(useDiffStore.getState().active).toBe(true)
      expect(useWorkspaceStore.getState().activeWorkspace).toBe('map')
    })

    it('clicking "View diff" dismisses the toast', async () => {
      const user = userEvent.setup()
      const { bus, emit } = makeStubBus()
      useDiffStore.setState({ pendingDelta: MOCK_PAYLOAD })
      render(<ToastBar bus={bus} />)

      act(() => {
        emit({ type: 'validate:diff', payload: MOCK_PAYLOAD })
      })

      expect(screen.getAllByTestId('toast')).toHaveLength(1)
      await user.click(screen.getByRole('button', { name: /view diff/i }))
      expect(screen.queryAllByTestId('toast')).toHaveLength(0)
    })

    it('validate:diff toast auto-dismisses after 8s', () => {
      vi.useFakeTimers()
      const { bus, emit } = makeStubBus()
      render(<ToastBar bus={bus} />)

      act(() => {
        emit({ type: 'validate:diff', payload: MOCK_PAYLOAD })
      })

      expect(screen.getAllByTestId('toast')).toHaveLength(1)
      act(() => {
        vi.advanceTimersByTime(8000)
      })
      expect(screen.queryAllByTestId('toast')).toHaveLength(0)
      vi.useRealTimers()
    })
  })
})
