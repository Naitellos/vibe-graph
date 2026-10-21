import type { PersistStorage, StorageValue } from 'zustand/middleware'

interface DebouncedStorageOptions {
  delay?: number
}

export function createDebouncedStorage<T>(opts: DebouncedStorageOptions = {}): PersistStorage<T> {
  const delay = opts.delay ?? 300
  const timers = new Map<string, ReturnType<typeof setTimeout>>()

  return {
    getItem: (name) => {
      if (typeof localStorage === 'undefined') return null
      const raw = localStorage.getItem(name)
      if (raw === null) return null
      try {
        return JSON.parse(raw) as StorageValue<T>
      } catch {
        return null
      }
    },

    setItem: (name, value) => {
      if (typeof localStorage === 'undefined') return
      // Cancel any pending write for this key
      const existing = timers.get(name)
      if (existing !== undefined) clearTimeout(existing)
      const timer = setTimeout(() => {
        try {
          localStorage.setItem(name, JSON.stringify(value))
        } catch {
          // Storage quota exceeded — silently drop.
        }
        timers.delete(name)
      }, delay)
      timers.set(name, timer)
    },

    removeItem: (name) => {
      if (typeof localStorage === 'undefined') return
      // Cancel pending write so we don't resurrect the key
      const existing = timers.get(name)
      if (existing !== undefined) {
        clearTimeout(existing)
        timers.delete(name)
      }
      localStorage.removeItem(name)
    },
  }
}
