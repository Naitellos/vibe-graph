import type { ActivityEntry } from '@codearch/core'
import { create } from 'zustand'
import { useWorkspaceStore } from './workspace.js'

const MAX_ENTRIES = 500

export interface ActivityLogState {
  entries: ActivityEntry[]
  badgeCount: number
  lastSeenTs: number
  isLoading: boolean
  loadInitial(): Promise<void>
  receiveLive(entry: ActivityEntry): void
  markRead(): void
}

export const useActivityLogStore = create<ActivityLogState>()((set, get) => ({
  entries: [],
  badgeCount: 0,
  lastSeenTs: 0,
  isLoading: false,
  async loadInitial() {
    set({ isLoading: true })
    try {
      const since = get().lastSeenTs
      const url = `/api/agent-activity${since > 0 ? `?since=${since}` : ''}`
      const res = await fetch(url)
      const body = (await res.json()) as { entries: ActivityEntry[] }
      const seen = new Set(get().entries.map((e) => e.id))
      const merged = [...get().entries]
      for (const e of body.entries) {
        if (seen.has(e.id)) continue
        merged.push(e)
        seen.add(e.id)
      }
      const trimmed =
        merged.length > MAX_ENTRIES ? merged.slice(merged.length - MAX_ENTRIES) : merged
      const maxTs = trimmed.reduce((m, e) => Math.max(m, e.ts), get().lastSeenTs)
      set({ entries: trimmed, lastSeenTs: maxTs, isLoading: false })
    } catch {
      set({ isLoading: false })
    }
  },
  receiveLive(entry) {
    const { entries, badgeCount, lastSeenTs } = get()
    if (entries.some((e) => e.id === entry.id)) return
    const next = [...entries, entry]
    const trimmed = next.length > MAX_ENTRIES ? next.slice(next.length - MAX_ENTRIES) : next
    const onActivityTab = useWorkspaceStore.getState().activeWorkspace === 'activity'
    set({
      entries: trimmed,
      lastSeenTs: Math.max(lastSeenTs, entry.ts),
      badgeCount: onActivityTab ? 0 : badgeCount + 1,
    })
  },
  markRead() {
    set({ badgeCount: 0 })
  },
}))
