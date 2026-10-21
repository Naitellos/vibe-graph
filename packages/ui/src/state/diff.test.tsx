import { beforeEach, describe, expect, it, vi } from 'vitest'
import { useDiffStore } from './diff.js'

const payload = (status = 'warn') =>
  ({
    status,
    baselineSnapshotId: 'b',
    edges: { added: [], removed: [] },
    nodes: { added: [], removed: [] },
    blastRadius: [],
    violations: { added: [], removed: [] },
    findings: { added: [], removed: [] },
    counts: {
      addedEdges: 0,
      removedEdges: 0,
      newViolations: 0,
      removedViolations: 0,
      newFindings: 0,
      resolvedFindings: 0,
    },
  }) as never

describe('useDiffStore', () => {
  beforeEach(() => useDiffStore.getState().clear())

  it('receiveAgentDelta sets pending without activating or clobbering active', () => {
    const manual = payload('violation')
    useDiffStore.setState({ delta: manual, active: true, source: 'manual' })
    useDiffStore.getState().receiveAgentDelta(payload('warn'))
    const s = useDiffStore.getState()
    expect(s.active).toBe(true)
    expect(s.delta).toBe(manual)
    expect(s.pendingDelta).not.toBeNull()
  })

  it('activate promotes the pending agent delta', () => {
    const agent = payload('warn')
    useDiffStore.getState().receiveAgentDelta(agent)
    useDiffStore.getState().activate()
    const s = useDiffStore.getState()
    expect(s.active).toBe(true)
    expect(s.delta).toBe(agent)
    expect(s.source).toBe('agent')
    expect(s.pendingDelta).toBeNull()
  })

  it('runValidate posts and activates on success', async () => {
    const p = payload('ok')
    vi.stubGlobal(
      'fetch',
      // biome-ignore lint/suspicious/noExplicitAny: test patching
      vi.fn(async () => ({ ok: true, json: async () => ({ ok: true, data: p }) })) as any,
    )
    await useDiffStore.getState().runValidate()
    const s = useDiffStore.getState()
    expect(s.active).toBe(true)
    expect(s.source).toBe('manual')
    expect(s.status).toBe('idle')
    vi.unstubAllGlobals()
  })

  it('runValidate sets error status on failure', async () => {
    vi.stubGlobal(
      'fetch',
      vi.fn(async () => ({
        ok: false,
        status: 409,
        json: async () => ({ ok: false, error: 'NO_BASELINE', code: 'NO_BASELINE' }),
        // biome-ignore lint/suspicious/noExplicitAny: test patching
      })) as any,
    )
    await useDiffStore.getState().runValidate()
    expect(useDiffStore.getState().status).toBe('error')
    expect(useDiffStore.getState().active).toBe(false)
    vi.unstubAllGlobals()
  })

  it('clear resets everything including pending', () => {
    useDiffStore.setState({
      delta: payload(),
      active: true,
      pendingDelta: payload(),
      source: 'agent',
    })
    useDiffStore.getState().clear()
    expect(useDiffStore.getState()).toMatchObject({
      delta: null,
      active: false,
      source: null,
      pendingDelta: null,
    })
  })
})
