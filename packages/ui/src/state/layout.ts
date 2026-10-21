import { create } from 'zustand'
import { persist } from 'zustand/middleware'
import { createDebouncedStorage } from './persist-storage.js'

export type LeftTab = 'findings' | 'filters'
export type RightTab = 'detail' | 'evidence' | 'context-pack'

export interface LayoutState {
  leftWidth: number
  rightWidth: number
  leftCollapsed: boolean
  rightCollapsed: boolean
  leftActiveTab: LeftTab
  rightActiveTab: RightTab
  fullscreenTarget: 'left' | 'center' | 'right' | null
  focusMode: boolean
  paletteOpen: boolean
  setLeftWidth(w: number): void
  setRightWidth(w: number): void
  setLeftCollapsed(b: boolean): void
  setRightCollapsed(b: boolean): void
  toggleLeftCollapsed(): void
  toggleRightCollapsed(): void
  setLeftActiveTab(t: LeftTab): void
  setRightActiveTab(t: RightTab): void
  setFullscreenTarget(t: 'left' | 'center' | 'right' | null): void
  setFocusMode(v: boolean): void
  toggleFocusMode(): void
  setPaletteOpen(v: boolean): void
  togglePaletteOpen(): void
  reset(): void
}

const DEFAULTS = {
  leftWidth: 320,
  rightWidth: 380,
  leftCollapsed: false,
  rightCollapsed: false,
  leftActiveTab: 'findings' as LeftTab,
  rightActiveTab: 'detail' as RightTab,
  fullscreenTarget: null,
  focusMode: false,
  paletteOpen: false,
} as const

const _layoutStorage = createDebouncedStorage<Partial<LayoutState>>({ delay: 300 })

export const useLayoutStore = create<LayoutState>()(
  persist(
    (set) => ({
      ...DEFAULTS,
      setLeftWidth: (w) => set({ leftWidth: w }),
      setRightWidth: (w) => set({ rightWidth: w }),
      setLeftCollapsed: (b) => set({ leftCollapsed: b }),
      setRightCollapsed: (b) => set({ rightCollapsed: b }),
      toggleLeftCollapsed: () => set((s) => ({ leftCollapsed: !s.leftCollapsed })),
      toggleRightCollapsed: () => set((s) => ({ rightCollapsed: !s.rightCollapsed })),
      setLeftActiveTab: (t) => set({ leftActiveTab: t }),
      setRightActiveTab: (t) => set({ rightActiveTab: t }),
      setFullscreenTarget: (t) => set({ fullscreenTarget: t }),
      setFocusMode: (v) => set({ focusMode: v }),
      toggleFocusMode: () => set((s) => ({ focusMode: !s.focusMode })),
      setPaletteOpen: (v) => set({ paletteOpen: v }),
      togglePaletteOpen: () => set((s) => ({ paletteOpen: !s.paletteOpen })),
      reset: () => set({ ...DEFAULTS }),
    }),
    {
      name: 'vibegraph.layout',
      storage: _layoutStorage,
      partialize: (state) => ({
        leftWidth: state.leftWidth,
        rightWidth: state.rightWidth,
        leftCollapsed: state.leftCollapsed,
        rightCollapsed: state.rightCollapsed,
        leftActiveTab: state.leftActiveTab,
        rightActiveTab: state.rightActiveTab,
        // fullscreenTarget, focusMode, paletteOpen are transient — not persisted
      }),
    },
  ),
)
