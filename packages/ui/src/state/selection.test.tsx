import { afterEach, describe, expect, it } from 'vitest'
import { useSelectionStore } from './selection.js'

describe('useSelectionStore', () => {
  afterEach(() => {
    useSelectionStore.setState({
      selectedNodeId: null,
      selectedEdgeId: null,
      selectedFindingId: null,
      hoveredNodeId: null,
    })
  })

  describe('default state', () => {
    it('selectedNodeId defaults to null', () => {
      expect(useSelectionStore.getState().selectedNodeId).toBeNull()
    })
    it('selectedEdgeId defaults to null', () => {
      expect(useSelectionStore.getState().selectedEdgeId).toBeNull()
    })
    it('selectedFindingId defaults to null', () => {
      expect(useSelectionStore.getState().selectedFindingId).toBeNull()
    })
    it('hoveredNodeId defaults to null', () => {
      expect(useSelectionStore.getState().hoveredNodeId).toBeNull()
    })
  })

  describe('actions', () => {
    it('setSelectedNode sets selectedNodeId', () => {
      useSelectionStore.getState().setSelectedNode('node-1')
      expect(useSelectionStore.getState().selectedNodeId).toBe('node-1')
    })

    it('setSelectedNode accepts null', () => {
      useSelectionStore.getState().setSelectedNode('node-1')
      useSelectionStore.getState().setSelectedNode(null)
      expect(useSelectionStore.getState().selectedNodeId).toBeNull()
    })

    it('setSelectedEdge sets selectedEdgeId', () => {
      useSelectionStore.getState().setSelectedEdge('edge-1')
      expect(useSelectionStore.getState().selectedEdgeId).toBe('edge-1')
    })

    it('setSelectedFinding sets selectedFindingId', () => {
      useSelectionStore.getState().setSelectedFinding('finding-1')
      expect(useSelectionStore.getState().selectedFindingId).toBe('finding-1')
    })

    it('setHoveredNode sets hoveredNodeId', () => {
      useSelectionStore.getState().setHoveredNode('node-2')
      expect(useSelectionStore.getState().hoveredNodeId).toBe('node-2')
    })

    it('clear resets all fields to null', () => {
      const state = useSelectionStore.getState()
      state.setSelectedNode('node-1')
      state.setSelectedEdge('edge-1')
      state.setSelectedFinding('finding-1')
      state.setHoveredNode('node-2')

      useSelectionStore.getState().clear()

      const after = useSelectionStore.getState()
      expect(after.selectedNodeId).toBeNull()
      expect(after.selectedEdgeId).toBeNull()
      expect(after.selectedFindingId).toBeNull()
      expect(after.hoveredNodeId).toBeNull()
    })
  })
})
