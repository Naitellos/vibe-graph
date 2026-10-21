import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import { useLayoutStore } from './layout.js'
import { useThemeStore } from './theme.js'

const DEFAULTS = {
  leftWidth: 320,
  rightWidth: 380,
  leftCollapsed: false,
  rightCollapsed: false,
  leftActiveTab: 'findings' as const,
  rightActiveTab: 'detail' as const,
  fullscreenTarget: null,
  focusMode: false,
  paletteOpen: false,
}

describe('useLayoutStore', () => {
  beforeEach(() => {
    localStorage.clear()
    useLayoutStore.getState().reset()
  })

  afterEach(() => {
    vi.useRealTimers()
    localStorage.clear()
    useLayoutStore.getState().reset()
  })

  describe('default state', () => {
    it('leftWidth defaults to 320', () => {
      expect(useLayoutStore.getState().leftWidth).toBe(320)
    })
    it('rightWidth defaults to 380', () => {
      expect(useLayoutStore.getState().rightWidth).toBe(380)
    })
    it('leftCollapsed defaults to false', () => {
      expect(useLayoutStore.getState().leftCollapsed).toBe(false)
    })
    it('rightCollapsed defaults to false', () => {
      expect(useLayoutStore.getState().rightCollapsed).toBe(false)
    })
    it('leftActiveTab defaults to findings', () => {
      expect(useLayoutStore.getState().leftActiveTab).toBe('findings')
    })
    it('rightActiveTab defaults to detail', () => {
      expect(useLayoutStore.getState().rightActiveTab).toBe('detail')
    })
    it('fullscreenTarget defaults to null', () => {
      expect(useLayoutStore.getState().fullscreenTarget).toBeNull()
    })
    it('focusMode defaults to false', () => {
      expect(useLayoutStore.getState().focusMode).toBe(false)
    })
    it('paletteOpen defaults to false', () => {
      expect(useLayoutStore.getState().paletteOpen).toBe(false)
    })
  })

  describe('actions', () => {
    it('setLeftWidth updates leftWidth', () => {
      useLayoutStore.getState().setLeftWidth(400)
      expect(useLayoutStore.getState().leftWidth).toBe(400)
    })

    it('setRightWidth updates rightWidth', () => {
      useLayoutStore.getState().setRightWidth(500)
      expect(useLayoutStore.getState().rightWidth).toBe(500)
    })

    it('setLeftCollapsed updates leftCollapsed', () => {
      useLayoutStore.getState().setLeftCollapsed(true)
      expect(useLayoutStore.getState().leftCollapsed).toBe(true)
    })

    it('setRightCollapsed updates rightCollapsed', () => {
      useLayoutStore.getState().setRightCollapsed(true)
      expect(useLayoutStore.getState().rightCollapsed).toBe(true)
    })

    it('setLeftActiveTab updates leftActiveTab', () => {
      useLayoutStore.getState().setLeftActiveTab('filters')
      expect(useLayoutStore.getState().leftActiveTab).toBe('filters')
    })

    it('setRightActiveTab updates rightActiveTab', () => {
      useLayoutStore.getState().setRightActiveTab('evidence')
      expect(useLayoutStore.getState().rightActiveTab).toBe('evidence')
    })

    it('setRightActiveTab accepts context-pack', () => {
      useLayoutStore.getState().setRightActiveTab('context-pack')
      expect(useLayoutStore.getState().rightActiveTab).toBe('context-pack')
    })

    it('setFullscreenTarget updates fullscreenTarget', () => {
      useLayoutStore.getState().setFullscreenTarget('center')
      expect(useLayoutStore.getState().fullscreenTarget).toBe('center')
    })

    it('setFullscreenTarget accepts null', () => {
      useLayoutStore.getState().setFullscreenTarget('left')
      useLayoutStore.getState().setFullscreenTarget(null)
      expect(useLayoutStore.getState().fullscreenTarget).toBeNull()
    })

    it('toggleLeftCollapsed flips false → true → false', () => {
      expect(useLayoutStore.getState().leftCollapsed).toBe(false)
      useLayoutStore.getState().toggleLeftCollapsed()
      expect(useLayoutStore.getState().leftCollapsed).toBe(true)
      useLayoutStore.getState().toggleLeftCollapsed()
      expect(useLayoutStore.getState().leftCollapsed).toBe(false)
    })

    it('toggleRightCollapsed flips false → true → false', () => {
      expect(useLayoutStore.getState().rightCollapsed).toBe(false)
      useLayoutStore.getState().toggleRightCollapsed()
      expect(useLayoutStore.getState().rightCollapsed).toBe(true)
      useLayoutStore.getState().toggleRightCollapsed()
      expect(useLayoutStore.getState().rightCollapsed).toBe(false)
    })

    it('reset restores all defaults after mutations', () => {
      const state = useLayoutStore.getState()
      state.setLeftWidth(999)
      state.setRightWidth(999)
      state.setLeftCollapsed(true)
      state.setRightCollapsed(true)
      state.setLeftActiveTab('filters')
      state.setRightActiveTab('context-pack')
      state.setFullscreenTarget('right')
      state.setPaletteOpen(true)

      useLayoutStore.getState().reset()

      const after = useLayoutStore.getState()
      expect(after.leftWidth).toBe(DEFAULTS.leftWidth)
      expect(after.rightWidth).toBe(DEFAULTS.rightWidth)
      expect(after.leftCollapsed).toBe(DEFAULTS.leftCollapsed)
      expect(after.rightCollapsed).toBe(DEFAULTS.rightCollapsed)
      expect(after.leftActiveTab).toBe(DEFAULTS.leftActiveTab)
      expect(after.rightActiveTab).toBe(DEFAULTS.rightActiveTab)
      expect(after.fullscreenTarget).toBe(DEFAULTS.fullscreenTarget)
      expect(after.paletteOpen).toBe(DEFAULTS.paletteOpen)
    })

    it('setFocusMode sets focusMode', () => {
      useLayoutStore.getState().setFocusMode(true)
      expect(useLayoutStore.getState().focusMode).toBe(true)
      useLayoutStore.getState().setFocusMode(false)
      expect(useLayoutStore.getState().focusMode).toBe(false)
    })

    it('toggleFocusMode flips false → true → false', () => {
      expect(useLayoutStore.getState().focusMode).toBe(false)
      useLayoutStore.getState().toggleFocusMode()
      expect(useLayoutStore.getState().focusMode).toBe(true)
      useLayoutStore.getState().toggleFocusMode()
      expect(useLayoutStore.getState().focusMode).toBe(false)
    })

    it('reset restores focusMode to false', () => {
      useLayoutStore.getState().setFocusMode(true)
      useLayoutStore.getState().reset()
      expect(useLayoutStore.getState().focusMode).toBe(false)
    })

    it('setPaletteOpen sets paletteOpen', () => {
      useLayoutStore.getState().setPaletteOpen(true)
      expect(useLayoutStore.getState().paletteOpen).toBe(true)
      useLayoutStore.getState().setPaletteOpen(false)
      expect(useLayoutStore.getState().paletteOpen).toBe(false)
    })

    it('togglePaletteOpen flips false → true → false', () => {
      expect(useLayoutStore.getState().paletteOpen).toBe(false)
      useLayoutStore.getState().togglePaletteOpen()
      expect(useLayoutStore.getState().paletteOpen).toBe(true)
      useLayoutStore.getState().togglePaletteOpen()
      expect(useLayoutStore.getState().paletteOpen).toBe(false)
    })

    it('reset restores paletteOpen to false', () => {
      useLayoutStore.getState().setPaletteOpen(true)
      useLayoutStore.getState().reset()
      expect(useLayoutStore.getState().paletteOpen).toBe(false)
    })
  })

  describe('persistence', () => {
    it('after 300ms, localStorage.vibegraph.layout reflects mutations', () => {
      vi.useFakeTimers()
      useLayoutStore.getState().setLeftWidth(400)

      // Not yet written (debounced)
      expect(localStorage.getItem('vibegraph.layout')).toBeNull()

      vi.advanceTimersByTime(300)

      const raw = localStorage.getItem('vibegraph.layout')
      expect(raw).not.toBeNull()
      const parsed = JSON.parse(raw ?? '') as { state: { leftWidth: number } }
      expect(parsed.state.leftWidth).toBe(400)
    })

    it('transient fields (fullscreenTarget, focusMode, paletteOpen) are NOT persisted', () => {
      vi.useFakeTimers()
      useLayoutStore.getState().setFullscreenTarget('center')
      useLayoutStore.getState().setFocusMode(true)
      useLayoutStore.getState().setPaletteOpen(true)

      vi.advanceTimersByTime(300)

      const raw = localStorage.getItem('vibegraph.layout')
      expect(raw).not.toBeNull()
      const state = JSON.parse(raw ?? '') as { state: Record<string, unknown> }
      expect(state.state).not.toHaveProperty('fullscreenTarget')
      expect(state.state).not.toHaveProperty('focusMode')
      expect(state.state).not.toHaveProperty('paletteOpen')
    })

    it('reset does NOT affect useThemeStore.theme', () => {
      useThemeStore.getState().setTheme('minimal')
      useLayoutStore.getState().setLeftWidth(999)
      useLayoutStore.getState().reset()
      expect(useThemeStore.getState().theme).toBe('minimal')
      // Restore theme
      useThemeStore.getState().setTheme('mystical')
    })
  })
})
