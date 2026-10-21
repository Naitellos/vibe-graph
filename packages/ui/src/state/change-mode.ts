import type { PrepareTaskInput, PrepareTaskOutput } from '@codearch/core'
import { create } from 'zustand'

export type ChangeModeMode = 'refactor' | 'feature' | 'bugfix'

export interface ChangeModeState {
  intent: string
  paths: string[]
  mode: ChangeModeMode
  lastSubmittedInput: PrepareTaskInput | null
  preparedTask: PrepareTaskOutput | null
  status: 'idle' | 'loading' | 'error'
  error: string | null
  setIntent(v: string): void
  setPaths(v: string[]): void
  setMode(v: ChangeModeMode): void
  submit(): Promise<void>
  reset(): void
}

export const useChangeModeStore = create<ChangeModeState>()((set, get) => ({
  intent: '',
  paths: [],
  mode: 'refactor',
  lastSubmittedInput: null,
  preparedTask: null,
  status: 'idle',
  error: null,
  setIntent: (intent) => set({ intent }),
  setPaths: (paths) => set({ paths }),
  setMode: (mode) => set({ mode }),
  async submit() {
    const { intent, paths, mode } = get()
    const input: PrepareTaskInput = { intent, paths, mode }
    set({ status: 'loading', error: null })
    try {
      const res = await fetch('/api/prepare-task', {
        method: 'POST',
        headers: { 'content-type': 'application/json' },
        body: JSON.stringify(input),
      })
      const body = (await res.json()) as
        | { ok: true; data: PrepareTaskOutput }
        | { ok: false; error: string }
      if (!body.ok) {
        set({ status: 'error', error: body.error })
        return
      }
      set({ preparedTask: body.data, lastSubmittedInput: input, status: 'idle', error: null })
    } catch (err) {
      set({ status: 'error', error: err instanceof Error ? err.message : String(err) })
    }
  },
  reset() {
    set({ preparedTask: null, lastSubmittedInput: null, status: 'idle', error: null })
  },
}))
