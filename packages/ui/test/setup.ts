import '@testing-library/jest-dom/vitest'
import { cleanup } from '@testing-library/react'
import { afterEach } from 'vitest'

// React Testing Library auto-cleanup only works when afterEach is globally
// available. Since vitest globals is not enabled, wire it up explicitly here.
afterEach(() => {
  cleanup()
})

// react-resizable-panels uses ResizeObserver internally; jsdom does not ship it.
if (typeof globalThis.ResizeObserver === 'undefined') {
  globalThis.ResizeObserver = class ResizeObserver {
    observe() {}
    unobserve() {}
    disconnect() {}
  }
}
