import { useEffect, useRef } from 'react'
import { type LeftTab, type RightTab, useLayoutStore } from './layout.js'
import { useSelectionStore } from './selection.js'
import { type Workspace, useWorkspaceStore } from './workspace.js'

const LEFT_TABS: readonly LeftTab[] = ['findings', 'filters']
const RIGHT_TABS: readonly RightTab[] = ['detail', 'evidence', 'context-pack']
// Only these are renderable today; flow/security/overview are disabled stubs (Plan 5+).
// Restricting hydration keeps ?workspace=<disabled|bogus> from blanking the center.
const HYDRATABLE_WORKSPACES: readonly Workspace[] = ['map', 'change', 'activity']

function isLeftTab(value: string): value is LeftTab {
  return (LEFT_TABS as readonly string[]).includes(value)
}

function isRightTab(value: string): value is RightTab {
  return (RIGHT_TABS as readonly string[]).includes(value)
}

function isValidWorkspace(value: string): value is Workspace {
  return (HYDRATABLE_WORKSPACES as readonly string[]).includes(value)
}

export function useUrlState(): void {
  const hydratedRef = useRef(false)

  // Effect 1: Hydrate from URL on first mount only
  useEffect(() => {
    const params = new URLSearchParams(window.location.search)

    const node = params.get('node')
    if (node !== null) {
      useSelectionStore.getState().setSelectedNode(node)
    }

    const finding = params.get('finding')
    if (finding !== null) {
      useSelectionStore.getState().setSelectedFinding(finding)
    }

    const edge = params.get('edge')
    if (edge !== null) {
      useSelectionStore.getState().setSelectedEdge(edge)
    }

    const lt = params.get('lt')
    if (lt !== null && isLeftTab(lt)) {
      useLayoutStore.getState().setLeftActiveTab(lt)
    }

    const rt = params.get('rt')
    if (rt !== null && isRightTab(rt)) {
      useLayoutStore.getState().setRightActiveTab(rt)
    }

    const ws = params.get('workspace')
    if (ws !== null && isValidWorkspace(ws)) {
      useWorkspaceStore.getState().setActiveWorkspace(ws)
    }

    hydratedRef.current = true
  }, [])

  // Reactive store subscriptions
  const selectedNodeId = useSelectionStore((s) => s.selectedNodeId)
  const selectedFindingId = useSelectionStore((s) => s.selectedFindingId)
  const selectedEdgeId = useSelectionStore((s) => s.selectedEdgeId)
  const leftActiveTab = useLayoutStore((s) => s.leftActiveTab)
  const rightActiveTab = useLayoutStore((s) => s.rightActiveTab)
  const activeWorkspace = useWorkspaceStore((s) => s.activeWorkspace)

  // Effect 2: Write URL on store change — guard until hydration completes
  useEffect(() => {
    if (!hydratedRef.current) return

    const params = new URLSearchParams()

    if (selectedNodeId !== null) {
      params.set('node', selectedNodeId)
    }
    if (selectedFindingId !== null) {
      params.set('finding', selectedFindingId)
    }
    if (selectedEdgeId !== null) {
      params.set('edge', selectedEdgeId)
    }

    // Only write tab params when non-default so empty URL stays clean
    if (leftActiveTab !== 'findings') {
      params.set('lt', leftActiveTab)
    }
    if (rightActiveTab !== 'detail') {
      params.set('rt', rightActiveTab)
    }

    // Only write workspace param when non-default so empty URL stays clean
    if (activeWorkspace !== 'map') {
      params.set('workspace', activeWorkspace)
    }

    const search = params.toString() ? `?${params.toString()}` : ''
    const hash = window.location.hash
    const pathname = window.location.pathname
    const newUrl = `${pathname}${search}${hash}`

    if (newUrl !== window.location.href) {
      window.history.replaceState({}, '', newUrl)
    }
  }, [
    selectedNodeId,
    selectedFindingId,
    selectedEdgeId,
    leftActiveTab,
    rightActiveTab,
    activeWorkspace,
  ])
}
