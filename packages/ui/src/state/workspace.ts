import { create } from 'zustand'

export type Workspace = 'map' | 'change' | 'activity' | 'flow' | 'security' | 'overview'

export interface WorkspaceState {
  activeWorkspace: Workspace
  setActiveWorkspace(w: Workspace): void
}

export const useWorkspaceStore = create<WorkspaceState>()((set) => ({
  activeWorkspace: 'map',
  setActiveWorkspace: (w) => set({ activeWorkspace: w }),
}))
