import { renderHook, waitFor } from '@testing-library/react'
import type { ReactNode } from 'react'
import { SWRConfig } from 'swr'
import { type MockInstance, afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import { useSubsystemDoc } from './subsystem-docs.js'

// ─── Stub data ────────────────────────────────────────────────────────────────

const STUB_SUBSYSTEM_DOC = {
  id: 'payments',
  title: 'Payments',
  layer: 'domain',
  status: 'shipped',
  description: 'Payment processing system',
  match: ['src/payments/**'],
  declaredDependsOn: ['auth'],
  declaredConsumedBy: ['checkout'],
  schemaTables: ['payments_transactions'],
  relatedSpecs: [],
  relatedDecisions: [],
  memoryRefs: [],
}

// ─── Test wrapper ─────────────────────────────────────────────────────────────

function makeWrapper() {
  return ({ children }: { children: ReactNode }) => (
    <SWRConfig
      value={{
        provider: () => new Map(),
        dedupingInterval: 0,
        suspense: false,
      }}
    >
      {children}
    </SWRConfig>
  )
}

// ─── Tests ────────────────────────────────────────────────────────────────────

describe('useSubsystemDoc', () => {
  let fetchSpy: MockInstance<typeof fetch>

  beforeEach(() => {
    fetchSpy = vi.spyOn(globalThis, 'fetch')
  })

  afterEach(() => {
    fetchSpy.mockRestore()
  })

  it('returns the doc for a valid slug', async () => {
    fetchSpy.mockResolvedValue(new Response(JSON.stringify(STUB_SUBSYSTEM_DOC), { status: 200 }))
    const wrapper = makeWrapper()

    const { result } = renderHook(() => useSubsystemDoc('payments'), { wrapper })

    expect(result.current.data).toBeUndefined()
    await waitFor(() => expect(result.current.data).toBeDefined())
    expect(result.current.data).toEqual(STUB_SUBSYSTEM_DOC)
    expect(fetchSpy).toHaveBeenCalledWith('/api/subsystem-docs/payments')
  })

  it('returns null when fetch returns 404', async () => {
    fetchSpy.mockResolvedValue(new Response('', { status: 404 }))
    const wrapper = makeWrapper()

    const { result } = renderHook(() => useSubsystemDoc('nonexistent'), { wrapper })

    expect(result.current.data).toBeUndefined()
    await waitFor(() => expect(result.current.data).toBeDefined())
    expect(result.current.data).toBeNull()
    expect(fetchSpy).toHaveBeenCalledWith('/api/subsystem-docs/nonexistent')
  })
})
