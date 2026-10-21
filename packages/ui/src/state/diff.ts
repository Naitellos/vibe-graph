import type { ValidateDiffUiPayload } from '@codearch/core'
import { create } from 'zustand'

interface DiffState {
  delta: ValidateDiffUiPayload | null
  pendingDelta: ValidateDiffUiPayload | null
  active: boolean
  source: 'manual' | 'agent' | null
  status: 'idle' | 'loading' | 'error'
  error?: string
  runValidate: (opts?: { taskId?: string }) => Promise<void>
  receiveAgentDelta: (payload: ValidateDiffUiPayload) => void
  activate: () => void
  clear: () => void
}

export const useDiffStore = create<DiffState>()((set, get) => ({
  delta: null,
  pendingDelta: null,
  active: false,
  source: null,
  status: 'idle',
  async runValidate(opts) {
    set({ status: 'loading', error: undefined })
    try {
      const res = await fetch('/api/validate-diff', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ taskId: opts?.taskId }),
      })
      const json = (await res.json()) as {
        ok: boolean
        data?: ValidateDiffUiPayload
        error?: string
        code?: string
      }
      if (!res.ok || !json.ok || json.data === undefined) {
        set({ status: 'error', error: json.error ?? `HTTP ${res.status}` })
        return
      }
      set({ delta: json.data, source: 'manual', active: true, pendingDelta: null, status: 'idle' })
    } catch (e) {
      set({ status: 'error', error: e instanceof Error ? e.message : String(e) })
    }
  },
  receiveAgentDelta(payload) {
    set({ pendingDelta: payload })
  },
  activate() {
    const p = get().pendingDelta
    if (p === null) return
    set({ delta: p, source: 'agent', active: true, pendingDelta: null })
  },
  clear() {
    set({
      delta: null,
      pendingDelta: null,
      active: false,
      source: null,
      status: 'idle',
      error: undefined,
    })
  },
}))
