import { readFileSync } from 'node:fs'
import { resolve } from 'node:path'
import { afterEach, beforeEach, describe, expect, it } from 'vitest'

const tokensCss = readFileSync(resolve(import.meta.dirname, './tokens.css'), 'utf8')

let styleEl: HTMLStyleElement | null = null

function injectTokens() {
  // Remove any previously injected style element
  if (styleEl) {
    styleEl.remove()
    styleEl = null
  }
  styleEl = document.createElement('style')
  styleEl.textContent = tokensCss
  document.head.appendChild(styleEl)
}

describe('theme tokens', () => {
  beforeEach(() => {
    injectTokens()
  })

  afterEach(() => {
    if (styleEl) {
      styleEl.remove()
      styleEl = null
    }
    document.documentElement.removeAttribute('data-theme')
  })

  describe('mystical theme', () => {
    beforeEach(() => {
      document.documentElement.setAttribute('data-theme', 'mystical')
    })

    it('exposes correct --bg', () => {
      const cs = getComputedStyle(document.documentElement)
      expect(cs.getPropertyValue('--bg').trim()).toBe('#0e0d18')
    })

    it('exposes correct --fg', () => {
      const cs = getComputedStyle(document.documentElement)
      expect(cs.getPropertyValue('--fg').trim()).toBe('#e8e3d1')
    })

    it('exposes correct --accent-primary', () => {
      const cs = getComputedStyle(document.documentElement)
      expect(cs.getPropertyValue('--accent-primary').trim()).toBe('#d4a574')
    })

    it('exposes correct --accent-warning', () => {
      const cs = getComputedStyle(document.documentElement)
      expect(cs.getPropertyValue('--accent-warning').trim()).toBe('#e0c474')
    })

    it('exposes correct --accent-danger', () => {
      const cs = getComputedStyle(document.documentElement)
      expect(cs.getPropertyValue('--accent-danger').trim()).toBe('#d47474')
    })

    it('exposes correct --accent-info', () => {
      const cs = getComputedStyle(document.documentElement)
      expect(cs.getPropertyValue('--accent-info').trim()).toBe('#74a5d4')
    })

    it('exposes Cormorant Garamond as --font-display', () => {
      const cs = getComputedStyle(document.documentElement)
      expect(cs.getPropertyValue('--font-display').trim()).toContain('Cormorant Garamond')
    })

    it('exposes Inter as --font-body', () => {
      const cs = getComputedStyle(document.documentElement)
      expect(cs.getPropertyValue('--font-body').trim()).toContain('Inter')
    })
  })

  describe('minimal theme', () => {
    beforeEach(() => {
      document.documentElement.setAttribute('data-theme', 'minimal')
    })

    it('exposes correct --bg', () => {
      const cs = getComputedStyle(document.documentElement)
      expect(cs.getPropertyValue('--bg').trim()).toBe('#0a0a0a')
    })

    it('exposes correct --fg', () => {
      const cs = getComputedStyle(document.documentElement)
      expect(cs.getPropertyValue('--fg').trim()).toBe('#fafafa')
    })

    it('exposes correct --accent-primary', () => {
      const cs = getComputedStyle(document.documentElement)
      expect(cs.getPropertyValue('--accent-primary').trim()).toBe('#fafafa')
    })

    it('exposes correct --accent-warning', () => {
      const cs = getComputedStyle(document.documentElement)
      expect(cs.getPropertyValue('--accent-warning').trim()).toBe('#e0c474')
    })

    it('exposes correct --accent-danger', () => {
      const cs = getComputedStyle(document.documentElement)
      expect(cs.getPropertyValue('--accent-danger').trim()).toBe('#d47474')
    })

    it('exposes correct --accent-info', () => {
      const cs = getComputedStyle(document.documentElement)
      expect(cs.getPropertyValue('--accent-info').trim()).toBe('#74a5d4')
    })

    it('exposes Inter as --font-display (minimal uses Inter)', () => {
      const cs = getComputedStyle(document.documentElement)
      expect(cs.getPropertyValue('--font-display').trim()).toContain('Inter')
    })

    it('exposes Inter as --font-body', () => {
      const cs = getComputedStyle(document.documentElement)
      expect(cs.getPropertyValue('--font-body').trim()).toContain('Inter')
    })
  })

  it('--font-display differs between themes', () => {
    document.documentElement.setAttribute('data-theme', 'mystical')
    const mysticalFontDisplay = getComputedStyle(document.documentElement)
      .getPropertyValue('--font-display')
      .trim()

    document.documentElement.setAttribute('data-theme', 'minimal')
    const minimalFontDisplay = getComputedStyle(document.documentElement)
      .getPropertyValue('--font-display')
      .trim()

    expect(mysticalFontDisplay).not.toBe(minimalFontDisplay)
    expect(mysticalFontDisplay).toContain('Cormorant Garamond')
    expect(minimalFontDisplay).toContain('Inter')
  })
})
