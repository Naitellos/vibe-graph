import type React from 'react'
import { useEffect } from 'react'
import { useThemeStore } from '../state/theme.js'

export function ThemeToggle(): React.JSX.Element {
  const theme = useThemeStore((s) => s.theme)
  const toggleTheme = useThemeStore((s) => s.toggleTheme)

  // Sync theme to html[data-theme] whenever it changes
  useEffect(() => {
    document.documentElement.setAttribute('data-theme', theme)
  }, [theme])

  // Button label is the *opposite* theme (i.e. what clicking will switch to)
  const nextThemeLabel = theme === 'mystical' ? 'Minimal' : 'Mystical'

  return (
    <button type="button" aria-label="Toggle theme" onClick={toggleTheme} className="theme-toggle">
      {nextThemeLabel}
    </button>
  )
}
