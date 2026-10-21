import { create } from 'zustand'

export interface SelectionState {
  selectedNodeId: string | null
  selectedEdgeId: string | null
  selectedFindingId: string | null
  hoveredNodeId: string | null
  setSelectedNode(id: string | null): void
  setSelectedEdge(id: string | null): void
  setSelectedFinding(id: string | null): void
  setHoveredNode(id: string | null): void
  clear(): void
}

export const useSelectionStore = create<SelectionState>()((set) => ({
  selectedNodeId: null,
  selectedEdgeId: null,
  selectedFindingId: null,
  hoveredNodeId: null,
  setSelectedNode: (id) => set({ selectedNodeId: id }),
  setSelectedEdge: (id) => set({ selectedEdgeId: id }),
  setSelectedFinding: (id) => set({ selectedFindingId: id }),
  setHoveredNode: (id) => set({ hoveredNodeId: id }),
  clear: () =>
    set({
      selectedNodeId: null,
      selectedEdgeId: null,
      selectedFindingId: null,
      hoveredNodeId: null,
    }),
}))
