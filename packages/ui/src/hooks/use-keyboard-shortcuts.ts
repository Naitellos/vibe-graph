import { useEffect } from 'react'
import { useLayoutStore } from '../state/layout.js'
import { useSelectionStore } from '../state/selection.js'

type FullscreenTarget = 'left' | 'center' | 'right' | null

const FULLSCREEN_CYCLE: FullscreenTarget[] = [null, 'left', 'center', 'right']

function nextFullscreenTarget(current: FullscreenTarget): FullscreenTarget {
  const idx = FULLSCREEN_CYCLE.indexOf(current)
  // Non-null: modulo guarantees a valid index within the array.
  // biome-ignore lint/style/noNonNullAssertion: modulo guarantees valid index
  return FULLSCREEN_CYCLE[(idx + 1) % FULLSCREEN_CYCLE.length]!
}

/**
 * Returns true when the given element is a text-entry target where we should
 * NOT intercept keyboard shortcuts (except the special-cased ⌘K).
 */
function isTextInput(el: Element | null): boolean {
  if (el === null) return false
  const tag = el.tagName
  if (tag === 'INPUT' || tag === 'TEXTAREA') return true
  if ((el as HTMLElement).isContentEditable) return true
  return false
}

/**
 * Attaches global keyboard shortcuts to `document`.
 *
 * Shortcuts implemented (spec §8.13):
 *   ⌘K / Ctrl+K       — toggle command palette
 *   ⌘B / Ctrl+B       — toggle left panel collapse
 *   ⌘\ / Ctrl+\       — toggle right panel collapse
 *   ⌘⇧R / Ctrl+⇧R    — reset layout store
 *   Shift+F           — cycle fullscreen target: null → left → center → right → null
 *   F11               — toggle center fullscreen
 *   Esc               — exit fullscreen if active, otherwise clear selection
 *
 * Deferred / no-op for v0:
 *   ⌘1 / ⌘2 / ⌘3     — "focus panel" — TODO: implement panel focus when panels
 *                        have focusable content; no-op for now.
 *   F                 — focus-fit graph; handled inside GraphCanvas (Task 5.14).
 *   ↑↓ / Enter in findings list — complex list nav; deferred.
 *   ?                 — keyboard help modal; deferred.
 */
export function useKeyboardShortcuts(): void {
  useEffect(() => {
    function handleKeyDown(event: KeyboardEvent): void {
      const cmdOrCtrl = event.metaKey || event.ctrlKey
      const { key, shiftKey } = event
      const active = document.activeElement

      // ⌘K is always handled, even inside text inputs (it closes the palette).
      if (cmdOrCtrl && key.toLowerCase() === 'k') {
        event.preventDefault()
        useLayoutStore.getState().togglePaletteOpen()
        return
      }

      // All other shortcuts are skipped while the user is typing.
      if (isTextInput(active)) return

      // ── Cmd/Ctrl combos ──────────────────────────────────────────────────────

      if (cmdOrCtrl) {
        if (shiftKey && key.toLowerCase() === 'r') {
          // ⌘⇧R — reset layout
          event.preventDefault()
          useLayoutStore.getState().reset()
          return
        }

        if (!shiftKey) {
          switch (key.toLowerCase()) {
            case 'b':
              // ⌘B — toggle left panel collapse
              event.preventDefault()
              useLayoutStore.getState().toggleLeftCollapsed()
              return

            case '\\':
              // ⌘\ — toggle right panel collapse
              event.preventDefault()
              useLayoutStore.getState().toggleRightCollapsed()
              return

            case '1':
            case '2':
            case '3':
              // TODO(v0): ⌘1/2/3 — focus panel — no-op until panels are focusable
              event.preventDefault()
              return
          }
        }
      }

      // ── Plain / Shift keys ───────────────────────────────────────────────────

      if (shiftKey && key === 'F') {
        // Shift+F — cycle fullscreen target
        event.preventDefault()
        const current = useLayoutStore.getState().fullscreenTarget
        useLayoutStore.getState().setFullscreenTarget(nextFullscreenTarget(current))
        return
      }

      if (key === 'F11') {
        // F11 — toggle center fullscreen
        event.preventDefault()
        const current = useLayoutStore.getState().fullscreenTarget
        useLayoutStore.getState().setFullscreenTarget(current === 'center' ? null : 'center')
        return
      }

      if (key === 'Escape') {
        // Esc — exit fullscreen first; if none active, clear selection
        const current = useLayoutStore.getState().fullscreenTarget
        if (current !== null) {
          useLayoutStore.getState().setFullscreenTarget(null)
        } else {
          useSelectionStore.getState().setSelectedNode(null)
          useSelectionStore.getState().setSelectedEdge(null)
          useSelectionStore.getState().setSelectedFinding(null)
        }
        return
      }
    }

    document.addEventListener('keydown', handleKeyDown)
    return () => {
      document.removeEventListener('keydown', handleKeyDown)
    }
  }, [])
}
