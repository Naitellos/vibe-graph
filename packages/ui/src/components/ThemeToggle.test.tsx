import { render, screen } from '@testing-library/react'
import { userEvent } from '@testing-library/user-event'
import { afterEach, beforeEach, describe, expect, it } from 'vitest'
import { useThemeStore } from '../state/theme.js'
import { ThemeToggle } from './ThemeToggle.js'

beforeEach(() => {
  useThemeStore.setState({ theme: 'mystical' })
  document.documentElement.removeAttribute('data-theme')
})

afterEach(() => {
  useThemeStore.setState({ theme: 'mystical' })
  document.documentElement.removeAttribute('data-theme')
})

describe('ThemeToggle', () => {
  describe('accessibility', () => {
    it('renders a button with aria-label Toggle theme', () => {
      render(<ThemeToggle />)
      expect(screen.getByRole('button', { name: /toggle theme/i })).toBeInTheDocument()
    })
  })

  describe('theme toggling', () => {
    it('clicking toggles theme from mystical to minimal', async () => {
      const user = userEvent.setup()
      render(<ThemeToggle />)

      expect(useThemeStore.getState().theme).toBe('mystical')
      await user.click(screen.getByRole('button', { name: /toggle theme/i }))
      expect(useThemeStore.getState().theme).toBe('minimal')
    })

    it('clicking toggles theme from minimal back to mystical', async () => {
      useThemeStore.setState({ theme: 'minimal' })
      const user = userEvent.setup()
      render(<ThemeToggle />)

      await user.click(screen.getByRole('button', { name: /toggle theme/i }))
      expect(useThemeStore.getState().theme).toBe('mystical')
    })

    it('double-click returns to original theme', async () => {
      const user = userEvent.setup()
      render(<ThemeToggle />)

      await user.click(screen.getByRole('button', { name: /toggle theme/i }))
      await user.click(screen.getByRole('button', { name: /toggle theme/i }))
      expect(useThemeStore.getState().theme).toBe('mystical')
    })
  })

  describe('data-theme attribute on html element', () => {
    it('sets data-theme on document.documentElement after click', async () => {
      const user = userEvent.setup()
      render(<ThemeToggle />)

      await user.click(screen.getByRole('button', { name: /toggle theme/i }))
      expect(document.documentElement.getAttribute('data-theme')).toBe('minimal')
    })

    it('flips data-theme back on second click', async () => {
      const user = userEvent.setup()
      render(<ThemeToggle />)

      await user.click(screen.getByRole('button', { name: /toggle theme/i }))
      await user.click(screen.getByRole('button', { name: /toggle theme/i }))
      expect(document.documentElement.getAttribute('data-theme')).toBe('mystical')
    })

    it('syncs data-theme on initial render when store has a theme', () => {
      useThemeStore.setState({ theme: 'minimal' })
      render(<ThemeToggle />)
      expect(document.documentElement.getAttribute('data-theme')).toBe('minimal')
    })
  })

  describe('button label', () => {
    it('shows opposite theme name when current theme is mystical', () => {
      render(<ThemeToggle />)
      // When mystical, button should hint at switching to minimal
      const btn = screen.getByRole('button', { name: /toggle theme/i })
      expect(btn.textContent?.toLowerCase()).toContain('minimal')
    })

    it('shows opposite theme name when current theme is minimal', () => {
      useThemeStore.setState({ theme: 'minimal' })
      render(<ThemeToggle />)
      const btn = screen.getByRole('button', { name: /toggle theme/i })
      expect(btn.textContent?.toLowerCase()).toContain('mystical')
    })
  })
})
