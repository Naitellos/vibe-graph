import type React from 'react'
import type { ReactNode } from 'react'
import { useCallback, useEffect, useRef } from 'react'
import {
  Group,
  type Layout,
  Panel,
  type PanelSize,
  Separator,
  usePanelRef,
} from 'react-resizable-panels'
import { useLayoutStore } from '../state/layout.js'
import { useWorkspaceStore } from '../state/workspace.js'
import './CockpitShell.css'

export interface CockpitShellProps {
  /** Content rendered inside the left panel body. */
  left: ReactNode
  /** Content rendered inside the center workspace area. */
  center: ReactNode
  /** Content rendered inside the right panel body. */
  right: ReactNode
}

// Default viewport width assumption for initial percentage calculation
const VIEWPORT_ESTIMATE = 1600

function pct(pixels: number): number {
  return Math.round((pixels / VIEWPORT_ESTIMATE) * 100)
}

/**
 * Converts a react-resizable-panels layout map (panel-id → percentage) into
 * pixel widths for the left and right panels using the given viewport width.
 *
 * Exported so tests can assert the conversion logic in isolation without
 * needing to simulate lib internals (ResizeObserver etc.) in jsdom.
 */
export function layoutToPixelWidths(
  layout: Layout,
  viewportPx: number,
): { left: number; right: number } {
  const leftPercent = layout['panel-left'] ?? 0
  const rightPercent = layout['panel-right'] ?? 0
  return {
    left: Math.round((leftPercent / 100) * viewportPx),
    right: Math.round((rightPercent / 100) * viewportPx),
  }
}

/**
 * Minimum panel width (px) we will persist. A collapse drives the measured
 * width to 0, and an imperative re-expand can momentarily report a sliver;
 * persisting either would poison `leftWidth`/`rightWidth` so the panel mounts
 * collapsed forever. Below this we keep the previous (last expanded) width.
 */
const MIN_PERSIST_WIDTH_PX = 48

/**
 * Minimum size (percent of the group) an expanded panel may render at. The
 * panel content (filters, findings, detail) clips below ~this, so we floor the
 * mounted size, the re-expand size, and the panel `minSize` with it. Kept in
 * percent (not px) so it stays consistent with `defaultSize`: a px `minSize`
 * larger than a percentage `defaultSize` makes react-resizable-panels
 * auto-collapse on mount.
 */
const MIN_USABLE_PANEL_PCT = 18

/** Keep the previous width when a measurement is a collapse/sliver artifact. */
export function sanitizePanelWidth(measuredPx: number, previousPx: number): number {
  return measuredPx >= MIN_PERSIST_WIDTH_PX ? measuredPx : previousPx
}

/**
 * Expand a collapsed panel back to a usable size. `expand()` alone only
 * restores the "most recent size", which after a programmatic collapse comes
 * back as a sliver — so we resize to the stored (last expanded) width, floored
 * to the usable minimum.
 */
function expandPanelToWidth(
  panel: { expand(): void; resize(size: number | string): void },
  widthPx: number,
): void {
  panel.expand()
  // Pixel string (a bare number resizes in pixels too, but the unit is explicit
  // here). minSize floors this if the stored width is itself too small.
  const target = Math.round(Math.max(widthPx, MIN_PERSIST_WIDTH_PX))
  panel.resize(`${target}px`)
}

export function CockpitShell({ left, center, right }: CockpitShellProps): React.JSX.Element {
  const activeWorkspace = useWorkspaceStore((s) => s.activeWorkspace)
  const leftWidth = useLayoutStore((s) => s.leftWidth)
  const rightWidth = useLayoutStore((s) => s.rightWidth)
  const leftCollapsed = useLayoutStore((s) => s.leftCollapsed)
  const rightCollapsed = useLayoutStore((s) => s.rightCollapsed)
  const fullscreenTarget = useLayoutStore((s) => s.fullscreenTarget)
  const setLeftWidth = useLayoutStore((s) => s.setLeftWidth)
  const setRightWidth = useLayoutStore((s) => s.setRightWidth)
  const setLeftCollapsed = useLayoutStore((s) => s.setLeftCollapsed)
  const setRightCollapsed = useLayoutStore((s) => s.setRightCollapsed)

  const leftPanelRef = usePanelRef()
  const rightPanelRef = usePanelRef()

  // Panel → store: sync collapse/expand triggered by drag (panel→store direction)
  const handleLeftResize = useCallback(
    (size: PanelSize) => {
      const collapsed = size.asPercentage === 0
      if (collapsed !== useLayoutStore.getState().leftCollapsed) {
        setLeftCollapsed(collapsed)
      }
    },
    [setLeftCollapsed],
  )

  const handleRightResize = useCallback(
    (size: PanelSize) => {
      const collapsed = size.asPercentage === 0
      if (collapsed !== useLayoutStore.getState().rightCollapsed) {
        setRightCollapsed(collapsed)
      }
    },
    [setRightCollapsed],
  )

  // Sync store collapsed state → panel imperative API
  const leftCollapsedRef = useRef(leftCollapsed)
  const rightCollapsedRef = useRef(rightCollapsed)

  useEffect(() => {
    const panel = leftPanelRef.current
    if (!panel) return
    if (leftCollapsed && !leftCollapsedRef.current) {
      panel.collapse()
    } else if (!leftCollapsed && leftCollapsedRef.current) {
      expandPanelToWidth(panel, useLayoutStore.getState().leftWidth)
    }
    leftCollapsedRef.current = leftCollapsed
  }, [leftCollapsed, leftPanelRef])

  useEffect(() => {
    const panel = rightPanelRef.current
    if (!panel) return
    if (rightCollapsed && !rightCollapsedRef.current) {
      panel.collapse()
    } else if (!rightCollapsed && rightCollapsedRef.current) {
      expandPanelToWidth(panel, useLayoutStore.getState().rightWidth)
    }
    rightCollapsedRef.current = rightCollapsed
  }, [rightCollapsed, rightPanelRef])

  // Compute default sizes from store (percentages)
  // Floor the mounted size: a tiny/poisoned persisted width would otherwise
  // mount the panel at ~0% and (being collapsible) collapse it on load.
  const leftPct = Math.max(pct(leftWidth), MIN_USABLE_PANEL_PCT)
  const rightPct = Math.max(pct(rightWidth), MIN_USABLE_PANEL_PCT)
  const centerPct = 100 - leftPct - rightPct

  // --- Workspace-specific layouts ---

  // 1-col: activity workspace — center only, no side panels
  if (activeWorkspace === 'activity') {
    return (
      <div className="cockpit-shell-root">
        <div className="cockpit-shell-panel">{center}</div>
      </div>
    )
  }

  // 2-col: change workspace — left + center only, no right panel
  if (activeWorkspace === 'change') {
    const changeCenterPct = 100 - leftPct
    return (
      <div className="cockpit-shell-root">
        <Group
          id="cockpit-change"
          className="cockpit-shell-group"
          onLayoutChanged={(layout) => {
            const viewport = window.innerWidth || VIEWPORT_ESTIMATE
            const { left } = layoutToPixelWidths(layout, viewport)
            const store = useLayoutStore.getState()
            setLeftWidth(sanitizePanelWidth(left, store.leftWidth))
          }}
        >
          <Panel
            id="panel-left"
            data-testid="panel-left"
            panelRef={leftPanelRef}
            defaultSize={leftPct}
            minSize={MIN_USABLE_PANEL_PCT}
            collapsible
            collapsedSize={0}
            onResize={handleLeftResize}
            data-collapsed={leftCollapsed ? 'true' : undefined}
          >
            <div className="cockpit-shell-panel">{left}</div>
          </Panel>

          <Separator className="cockpit-shell-separator" />

          <Panel id="panel-center" defaultSize={changeCenterPct < 10 ? 10 : changeCenterPct}>
            <div className="cockpit-shell-panel">{center}</div>
          </Panel>
        </Group>

        {leftCollapsed && (
          <button
            type="button"
            className="cockpit-collapsed-tab cockpit-collapsed-tab--left"
            aria-label="Expand left panel"
            onClick={() => setLeftCollapsed(false)}
          >
            ›
          </button>
        )}
      </div>
    )
  }

  // --- Fullscreen mode: skip the panel group, render only the active panel ---
  if (fullscreenTarget === 'left') {
    return (
      <div className="cockpit-shell-root">
        <div className="cockpit-shell-fullscreen">{left}</div>
      </div>
    )
  }

  if (fullscreenTarget === 'right') {
    return (
      <div className="cockpit-shell-root">
        <div className="cockpit-shell-fullscreen">{right}</div>
      </div>
    )
  }

  if (fullscreenTarget === 'center') {
    return (
      <div className="cockpit-shell-root">
        <div className="cockpit-shell-fullscreen">{center}</div>
      </div>
    )
  }

  // --- Normal three-column layout (map and all other workspaces) ---
  return (
    <div className="cockpit-shell-root">
      <Group
        id="cockpit-map"
        className="cockpit-shell-group"
        onLayoutChanged={(layout) => {
          const viewport = window.innerWidth || VIEWPORT_ESTIMATE
          const { left, right } = layoutToPixelWidths(layout, viewport)
          const store = useLayoutStore.getState()
          setLeftWidth(sanitizePanelWidth(left, store.leftWidth))
          setRightWidth(sanitizePanelWidth(right, store.rightWidth))
        }}
      >
        <Panel
          id="panel-left"
          data-testid="panel-left"
          panelRef={leftPanelRef}
          defaultSize={leftPct}
          minSize={MIN_USABLE_PANEL_PCT}
          collapsible
          collapsedSize={0}
          onResize={handleLeftResize}
          data-collapsed={leftCollapsed ? 'true' : undefined}
        >
          <div className="cockpit-shell-panel">{left}</div>
        </Panel>

        <Separator className="cockpit-shell-separator" />

        <Panel id="panel-center" defaultSize={centerPct < 10 ? 10 : centerPct}>
          <div className="cockpit-shell-panel">{center}</div>
        </Panel>

        <Separator className="cockpit-shell-separator" />

        <Panel
          id="panel-right"
          data-testid="panel-right"
          panelRef={rightPanelRef}
          defaultSize={rightPct}
          minSize={MIN_USABLE_PANEL_PCT}
          collapsible
          collapsedSize={0}
          onResize={handleRightResize}
          data-collapsed={rightCollapsed ? 'true' : undefined}
        >
          <div className="cockpit-shell-panel">{right}</div>
        </Panel>
      </Group>

      {/* Edge tabs: the only mouse affordance to reopen a fully-collapsed panel
          (the in-panel collapse button is hidden at 0 width). */}
      {leftCollapsed && (
        <button
          type="button"
          className="cockpit-collapsed-tab cockpit-collapsed-tab--left"
          aria-label="Expand left panel"
          onClick={() => setLeftCollapsed(false)}
        >
          ›
        </button>
      )}
      {rightCollapsed && (
        <button
          type="button"
          className="cockpit-collapsed-tab cockpit-collapsed-tab--right"
          aria-label="Expand right panel"
          onClick={() => setRightCollapsed(false)}
        >
          ‹
        </button>
      )}
    </div>
  )
}
