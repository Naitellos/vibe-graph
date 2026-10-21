import { create } from 'zustand'
import { persist } from 'zustand/middleware'
import { createDebouncedStorage } from './persist-storage.js'

export type Theme = 'mystical' | 'minimal'

export interface ThemeState {
  theme: Theme
  setTheme(t: Theme): void
  toggleTheme(): void
}

const _themeStorage = createDebouncedStorage<Partial<ThemeState>>({ delay: 300 })

export const useThemeStore = create<ThemeState>()(
  persist(
    (set, get) => ({
      theme: 'mystical',
      setTheme: (t) => set({ theme: t }),
      toggleTheme: () => set({ theme: get().theme === 'mystical' ? 'minimal' : 'mystical' }),
    }),
    {
      name: 'vibegraph.theme',
      storage: _themeStorage,
      partialize: (state) => ({ theme: state.theme }),
    },
  ),
)
