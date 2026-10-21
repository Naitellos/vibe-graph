import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import { useThemeStore } from './theme.js'

describe('useThemeStore', () => {
  beforeEach(() => {
    localStorage.clear()
    useThemeStore.setState({ theme: 'mystical' })
  })

  afterEach(() => {
    vi.useRealTimers()
    localStorage.clear()
    useThemeStore.setState({ theme: 'mystical' })
  })

  describe('default state', () => {
    it('theme defaults to mystical', () => {
      expect(useThemeStore.getState().theme).toBe('mystical')
    })
  })

  describe('actions', () => {
    it('setTheme sets theme to minimal', () => {
      useThemeStore.getState().setTheme('minimal')
      expect(useThemeStore.getState().theme).toBe('minimal')
    })

    it('setTheme sets theme back to mystical', () => {
      useThemeStore.getState().setTheme('minimal')
      useThemeStore.getState().setTheme('mystical')
      expect(useThemeStore.getState().theme).toBe('mystical')
    })

    it('toggleTheme switches mystical to minimal', () => {
      expect(useThemeStore.getState().theme).toBe('mystical')
      useThemeStore.getState().toggleTheme()
      expect(useThemeStore.getState().theme).toBe('minimal')
    })

    it('toggleTheme switches minimal to mystical', () => {
      useThemeStore.getState().setTheme('minimal')
      useThemeStore.getState().toggleTheme()
      expect(useThemeStore.getState().theme).toBe('mystical')
    })

    it('toggleTheme twice returns to original theme', () => {
      useThemeStore.getState().toggleTheme()
      useThemeStore.getState().toggleTheme()
      expect(useThemeStore.getState().theme).toBe('mystical')
    })
  })

  describe('persistence', () => {
    it('after 300ms, localStorage.vibegraph.theme reflects the current theme', () => {
      vi.useFakeTimers()
      useThemeStore.getState().setTheme('minimal')

      // Not yet written (debounced)
      expect(localStorage.getItem('vibegraph.theme')).toBeNull()

      vi.advanceTimersByTime(300)

      const raw = localStorage.getItem('vibegraph.theme')
      expect(raw).not.toBeNull()
      const parsed = JSON.parse(raw ?? '') as { state: { theme: string } }
      expect(parsed.state.theme).toBe('minimal')
    })
  })
})
