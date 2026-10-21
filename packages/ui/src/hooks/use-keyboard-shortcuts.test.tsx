import { act, fireEvent, render, renderHook } from '@testing-library/react'
import { afterEach, beforeEach, describe, expect, it } from 'vitest'
import { useLayoutStore } from '../state/layout.js'
import { useSelectionStore } from '../state/selection.js'
import { useThemeStore } from '../state/theme.js'
import { useKeyboardShortcuts } from './use-keyboard-shortcuts.js'

function resetStores() {
  localStorage.clear()
  useLayoutStore.getState().reset()
  useSelectionStore.setState({
    selectedNodeId: null,
    selectedEdgeId: null,
    selectedFindingId: null,
    hoveredNodeId: null,
  })
}

beforeEach(resetStores)
afterEach(resetStores)

describe('useKeyboardShortcuts', () => {
  it('⌘B toggles left panel collapsed', () => {
    renderHook(() => useKeyboardShortcuts())

    expect(useLayoutStore.getState().leftCollapsed).toBe(false)

    act(() => {
      fireEvent.keyDown(document, { key: 'b', metaKey: true })
    })
    expect(useLayoutStore.getState().leftCollapsed).toBe(true)

    act(() => {
      fireEvent.keyDown(document, { key: 'b', metaKey: true })
    })
    expect(useLayoutStore.getState().leftCollapsed).toBe(false)
  })

  it('Ctrl+B also toggles left panel (cross-platform)', () => {
    renderHook(() => useKeyboardShortcuts())

    act(() => {
      fireEvent.keyDown(document, { key: 'b', ctrlKey: true })
    })
    expect(useLayoutStore.getState().leftCollapsed).toBe(true)
  })

  it('⌘\\ toggles right panel collapsed', () => {
    renderHook(() => useKeyboardShortcuts())

    expect(useLayoutStore.getState().rightCollapsed).toBe(false)

    act(() => {
      fireEvent.keyDown(document, { key: '\\', metaKey: true })
    })
    expect(useLayoutStore.getState().rightCollapsed).toBe(true)

    act(() => {
      fireEvent.keyDown(document, { key: '\\', metaKey: true })
    })
    expect(useLayoutStore.getState().rightCollapsed).toBe(false)
  })

  it('⌘K toggles palette open', () => {
    renderHook(() => useKeyboardShortcuts())

    expect(useLayoutStore.getState().paletteOpen).toBe(false)

    act(() => {
      fireEvent.keyDown(document, { key: 'k', metaKey: true })
    })
    expect(useLayoutStore.getState().paletteOpen).toBe(true)

    act(() => {
      fireEvent.keyDown(document, { key: 'k', metaKey: true })
    })
    expect(useLayoutStore.getState().paletteOpen).toBe(false)
  })

  it('⌘⇧R resets layout store to defaults', () => {
    renderHook(() => useKeyboardShortcuts())

    // Mutate several layout fields
    useLayoutStore.getState().setLeftWidth(999)
    useLayoutStore.getState().setLeftCollapsed(true)
    useLayoutStore.getState().setFullscreenTarget('right')

    act(() => {
      fireEvent.keyDown(document, { key: 'r', metaKey: true, shiftKey: true })
    })

    const state = useLayoutStore.getState()
    expect(state.leftWidth).toBe(320)
    expect(state.leftCollapsed).toBe(false)
    expect(state.fullscreenTarget).toBeNull()
  })

  it('⌘⇧R does NOT touch the theme store', () => {
    renderHook(() => useKeyboardShortcuts())

    useThemeStore.getState().setTheme('minimal')

    act(() => {
      fireEvent.keyDown(document, { key: 'r', metaKey: true, shiftKey: true })
    })

    expect(useThemeStore.getState().theme).toBe('minimal')

    // Restore
    useThemeStore.getState().setTheme('mystical')
  })

  it('Esc clears selection when no fullscreen is active', () => {
    renderHook(() => useKeyboardShortcuts())

    useSelectionStore.getState().setSelectedNode('node-1')
    useSelectionStore.getState().setSelectedEdge('edge-1')
    useSelectionStore.getState().setSelectedFinding('finding-1')

    act(() => {
      fireEvent.keyDown(document, { key: 'Escape' })
    })

    const sel = useSelectionStore.getState()
    expect(sel.selectedNodeId).toBeNull()
    expect(sel.selectedEdgeId).toBeNull()
    expect(sel.selectedFindingId).toBeNull()
  })

  it('Esc exits fullscreen first, then clears selection on second press', () => {
    renderHook(() => useKeyboardShortcuts())

    useLayoutStore.getState().setFullscreenTarget('center')
    useSelectionStore.getState().setSelectedNode('node-1')

    // First Esc: exit fullscreen, selection unchanged
    act(() => {
      fireEvent.keyDown(document, { key: 'Escape' })
    })
    expect(useLayoutStore.getState().fullscreenTarget).toBeNull()
    expect(useSelectionStore.getState().selectedNodeId).toBe('node-1')

    // Second Esc: clear selection
    act(() => {
      fireEvent.keyDown(document, { key: 'Escape' })
    })
    expect(useSelectionStore.getState().selectedNodeId).toBeNull()
  })

  it('shortcuts are skipped when typing in an input', () => {
    const TestComponent = () => {
      useKeyboardShortcuts()
      return <input data-testid="search" />
    }

    const { getByTestId } = render(<TestComponent />)
    const input = getByTestId('search')
    input.focus()

    act(() => {
      fireEvent.keyDown(input, { key: 'b', metaKey: true })
    })

    // leftCollapsed should remain false — shortcut was skipped
    expect(useLayoutStore.getState().leftCollapsed).toBe(false)
  })

  it('⌘K still toggles palette even when an input is focused', () => {
    const TestComponent = () => {
      useKeyboardShortcuts()
      return <input data-testid="search" />
    }

    const { getByTestId } = render(<TestComponent />)
    const input = getByTestId('search')
    input.focus()

    act(() => {
      fireEvent.keyDown(input, { key: 'k', metaKey: true })
    })

    expect(useLayoutStore.getState().paletteOpen).toBe(true)
  })

  it('F11 sets fullscreenTarget to center when not already set', () => {
    renderHook(() => useKeyboardShortcuts())

    act(() => {
      fireEvent.keyDown(document, { key: 'F11' })
    })
    expect(useLayoutStore.getState().fullscreenTarget).toBe('center')
  })

  it('F11 clears fullscreenTarget when center is already fullscreen', () => {
    renderHook(() => useKeyboardShortcuts())

    useLayoutStore.getState().setFullscreenTarget('center')

    act(() => {
      fireEvent.keyDown(document, { key: 'F11' })
    })
    expect(useLayoutStore.getState().fullscreenTarget).toBeNull()
  })

  it('Shift+F cycles fullscreenTarget through null → left → center → right → null', () => {
    renderHook(() => useKeyboardShortcuts())

    // null → left
    act(() => {
      fireEvent.keyDown(document, { key: 'F', shiftKey: true })
    })
    expect(useLayoutStore.getState().fullscreenTarget).toBe('left')

    // left → center
    act(() => {
      fireEvent.keyDown(document, { key: 'F', shiftKey: true })
    })
    expect(useLayoutStore.getState().fullscreenTarget).toBe('center')

    // center → right
    act(() => {
      fireEvent.keyDown(document, { key: 'F', shiftKey: true })
    })
    expect(useLayoutStore.getState().fullscreenTarget).toBe('right')

    // right → null
    act(() => {
      fireEvent.keyDown(document, { key: 'F', shiftKey: true })
    })
    expect(useLayoutStore.getState().fullscreenTarget).toBeNull()
  })

  it('hook cleans up listener on unmount', () => {
    const { unmount } = renderHook(() => useKeyboardShortcuts())
    unmount()

    // After unmount, firing a key should NOT change state
    act(() => {
      fireEvent.keyDown(document, { key: 'b', metaKey: true })
    })
    expect(useLayoutStore.getState().leftCollapsed).toBe(false)
  })
})
