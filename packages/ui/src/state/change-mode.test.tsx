import { beforeEach, describe, expect, it, vi } from 'vitest'
import { useChangeModeStore } from './change-mode.js'

beforeEach(() => {
  useChangeModeStore.getState().reset()
  useChangeModeStore.setState({
    intent: '',
    paths: [],
    mode: 'refactor',
    preparedTask: null,
    lastSubmittedInput: null,
    status: 'idle',
    error: null,
  })
})

describe('useChangeModeStore', () => {
  it('updates intent/paths/mode', () => {
    useChangeModeStore.getState().setIntent('hi')
    useChangeModeStore.getState().setPaths(['a.ts'])
    useChangeModeStore.getState().setMode('feature')
    const s = useChangeModeStore.getState()
    expect(s.intent).toBe('hi')
    expect(s.paths).toEqual(['a.ts'])
    expect(s.mode).toBe('feature')
  })
  it('submit() POSTs to /api/prepare-task and stores result + input', async () => {
    const fakeOutput = {
      taskId: 't1',
      createdAt: '2026-05-28T00:00:00Z',
      target: { subsystems: ['x'], files: ['a.ts'] },
      summary: 's',
      risks: [],
      rules: [],
      doNotDo: [],
      requiredContext: { files: [], schemaTables: [], relatedAdrs: [] },
      recommendations: [],
      tests: [],
      baselineSnapshotId: 'b1',
    }
    const mockFetch1 = vi
      .fn()
      .mockResolvedValue({ ok: true, json: async () => ({ ok: true, data: fakeOutput }) })
    // biome-ignore lint/suspicious/noExplicitAny: test patching
    globalThis.fetch = mockFetch1 as any
    useChangeModeStore.getState().setIntent('refactor x')
    useChangeModeStore.getState().setPaths(['a.ts'])
    await useChangeModeStore.getState().submit()
    const s = useChangeModeStore.getState()
    expect(s.preparedTask).toEqual(fakeOutput)
    expect(s.lastSubmittedInput).toEqual({
      intent: 'refactor x',
      paths: ['a.ts'],
      mode: 'refactor',
    })
    expect(s.status).toBe('idle')
    expect(s.error).toBeNull()
  })
  it('submit() sets error + status="error" on { ok:false }', async () => {
    const mockFetch2 = vi.fn().mockResolvedValue({
      ok: false,
      status: 500,
      json: async () => ({ ok: false, error: 'no snapshot' }),
    })
    // biome-ignore lint/suspicious/noExplicitAny: test patching
    globalThis.fetch = mockFetch2 as any
    useChangeModeStore.getState().setIntent('x')
    useChangeModeStore.getState().setPaths(['a.ts'])
    await useChangeModeStore.getState().submit()
    const s = useChangeModeStore.getState()
    expect(s.status).toBe('error')
    expect(s.error).toBe('no snapshot')
  })
  it('reset() clears preparedTask + error but keeps form fields', () => {
    useChangeModeStore.setState({
      intent: 'keep',
      paths: ['k.ts'],
      // biome-ignore lint/suspicious/noExplicitAny: test patching
      preparedTask: {} as any,
      error: 'x',
      status: 'error',
    })
    useChangeModeStore.getState().reset()
    const s = useChangeModeStore.getState()
    expect(s.intent).toBe('keep')
    expect(s.paths).toEqual(['k.ts'])
    expect(s.preparedTask).toBeNull()
    expect(s.error).toBeNull()
    expect(s.status).toBe('idle')
  })
})
