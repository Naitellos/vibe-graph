import type React from 'react'
import type { ReactNode } from 'react'
import { useLayoutStore } from '../state/layout.js'

export interface PanelHeaderProps {
  /** Header label (e.g. "Findings", "Detail"). */
  title?: ReactNode
  /** Which side this header belongs to — drives which buttons render. */
  side: 'left' | 'right'
  /** Optional extra content (tab bar usually). Rendered before the right-aligned buttons. */
  children?: ReactNode
}

export function PanelHeader({ title, side, children }: PanelHeaderProps): React.JSX.Element {
  const leftCollapsed = useLayoutStore((s) => s.leftCollapsed)
  const rightCollapsed = useLayoutStore((s) => s.rightCollapsed)
  const fullscreenTarget = useLayoutStore((s) => s.fullscreenTarget)
  const toggleLeftCollapsed = useLayoutStore((s) => s.toggleLeftCollapsed)
  const toggleRightCollapsed = useLayoutStore((s) => s.toggleRightCollapsed)
  const setFullscreenTarget = useLayoutStore((s) => s.setFullscreenTarget)

  const isCollapsed = side === 'left' ? leftCollapsed : rightCollapsed

  function handleCollapse(): void {
    if (side === 'left') {
      toggleLeftCollapsed()
    } else {
      toggleRightCollapsed()
    }
  }

  function handleFullscreen(): void {
    if (fullscreenTarget === side) {
      setFullscreenTarget(null)
    } else {
      setFullscreenTarget(side)
    }
  }

  // Icon direction: left panel collapses «, right panel collapses ›
  const collapseIcon = side === 'left' ? (isCollapsed ? '›' : '«') : isCollapsed ? '«' : '›'
  const collapseLabel = side === 'left' ? 'Collapse left panel' : 'Collapse right panel'
  const fullscreenLabel =
    side === 'left' ? 'Toggle fullscreen for left panel' : 'Toggle fullscreen for right panel'

  return (
    <div className="cockpit-panel-header">
      {title != null && <span className="cockpit-panel-header__title">{title}</span>}
      {children}
      <div className="cockpit-panel-header__actions">
        <button
          type="button"
          aria-label={collapseLabel}
          onClick={handleCollapse}
          className="cockpit-panel-header__btn"
        >
          {collapseIcon}
        </button>
        <button
          type="button"
          aria-label={fullscreenLabel}
          onClick={handleFullscreen}
          className="cockpit-panel-header__btn"
        >
          {'⛶'}
        </button>
      </div>
    </div>
  )
}
