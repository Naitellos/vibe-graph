import { act, renderHook } from '@testing-library/react'
import { afterEach, beforeEach, describe, expect, it } from 'vitest'
import { useLayoutStore } from './layout.js'
import { useSelectionStore } from './selection.js'
import { useUrlState } from './url.js'
import { useWorkspaceStore } from './workspace.js'

function resetStores() {
  useSelectionStore.setState({
    selectedNodeId: null,
    selectedEdgeId: null,
    selectedFindingId: null,
    hoveredNodeId: null,
  })
  useLayoutStore.getState().reset()
  useWorkspaceStore.setState({ activeWorkspace: 'map' })
}

beforeEach(() => {
  resetStores()
  window.history.replaceState({}, '', '/')
})

afterEach(() => {
  resetStores()
  window.history.replaceState({}, '', '/')
})

describe('useUrlState', () => {
  describe('hydration from URL', () => {
    it('hydrates node from URL', () => {
      window.history.replaceState({}, '', '/?node=subsystem:oracle')
      renderHook(() => useUrlState())
      expect(useSelectionStore.getState().selectedNodeId).toBe('subsystem:oracle')
    })

    it('hydrates multiple params from URL', () => {
      window.history.replaceState(
        {},
        '',
        '/?node=a&finding=fnd_1&edge=a-%3Eb%3Aimports&lt=filters&rt=evidence',
      )
      renderHook(() => useUrlState())
      const sel = useSelectionStore.getState()
      const lay = useLayoutStore.getState()
      expect(sel.selectedNodeId).toBe('a')
      expect(sel.selectedFindingId).toBe('fnd_1')
      expect(sel.selectedEdgeId).toBe('a->b:imports')
      expect(lay.leftActiveTab).toBe('filters')
      expect(lay.rightActiveTab).toBe('evidence')
    })

    it('ignores invalid lt value', () => {
      window.history.replaceState({}, '', '/?lt=garbage')
      renderHook(() => useUrlState())
      expect(useLayoutStore.getState().leftActiveTab).toBe('findings')
    })

    it('ignores invalid rt value', () => {
      window.history.replaceState({}, '', '/?rt=garbage')
      renderHook(() => useUrlState())
      expect(useLayoutStore.getState().rightActiveTab).toBe('detail')
    })
  })

  describe('write-on-change', () => {
    it('updates URL when node is selected', async () => {
      const { result } = renderHook(() => useUrlState())
      await act(async () => {
        useSelectionStore.getState().setSelectedNode('subsystem:auth')
      })
      expect(window.location.href).toMatch(/[?&]node=subsystem%3Aauth/)
    })

    it('removes node param from URL when set to null', async () => {
      window.history.replaceState({}, '', '/?node=subsystem:oracle')
      renderHook(() => useUrlState())
      await act(async () => {
        useSelectionStore.getState().setSelectedNode(null)
      })
      expect(window.location.search).not.toContain('node=')
    })

    it('preserves hash when writing URL', async () => {
      window.history.replaceState({}, '', '/#anchor')
      renderHook(() => useUrlState())
      await act(async () => {
        useSelectionStore.getState().setSelectedNode('x')
      })
      expect(window.location.href).toContain('?node=x')
      expect(window.location.href).toContain('#anchor')
    })

    it('omits trailing ? when no params are present', async () => {
      renderHook(() => useUrlState())
      await act(async () => {
        useSelectionStore.getState().setSelectedNode(null)
      })
      expect(window.location.href).not.toContain('?')
    })
  })

  describe('workspace query param', () => {
    it('hydrates workspace from ?workspace=change', () => {
      window.history.replaceState({}, '', '/?workspace=change')
      renderHook(() => useUrlState())
      expect(useWorkspaceStore.getState().activeWorkspace).toBe('change')
    })

    it('writes workspace=activity to URL when workspace is set to activity', async () => {
      renderHook(() => useUrlState())
      await act(async () => {
        useWorkspaceStore.getState().setActiveWorkspace('activity')
      })
      expect(window.location.search).toContain('workspace=activity')
    })

    it('removes workspace param from URL when workspace is set back to map', async () => {
      window.history.replaceState({}, '', '/?workspace=activity')
      renderHook(() => useUrlState())
      await act(async () => {
        useWorkspaceStore.getState().setActiveWorkspace('map')
      })
      expect(window.location.search).not.toContain('workspace=')
    })

    it('ignores invalid ?workspace=bogus and leaves workspace as map', () => {
      window.history.replaceState({}, '', '/?workspace=bogus')
      renderHook(() => useUrlState())
      expect(useWorkspaceStore.getState().activeWorkspace).toBe('map')
    })

    it('ignores a disabled workspace param (flow) — stays on map', () => {
      window.history.replaceState({}, '', '/?workspace=flow')
      renderHook(() => useUrlState())
      expect(useWorkspaceStore.getState().activeWorkspace).toBe('map')
    })
  })
})
