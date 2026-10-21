import type { Evidence } from '@codearch/core'
import { render, screen, waitFor } from '@testing-library/react'
import type { ReactNode } from 'react'
import { SWRConfig } from 'swr'
import { describe, expect, it } from 'vitest'
import { EvidenceItem } from './EvidenceItem.js'

// ─── Fixtures ─────────────────────────────────────────────────────────────────

function makeEvidence(overrides?: Partial<Evidence>): Evidence {
  return {
    id: 'ev-1',
    sourceKind: 'ast',
    file: '/src/auth/service.ts',
    line: 42,
    detail: 'import statement',
    confidence: 'high',
    coupling: 'runtime',
    ...overrides,
  }
}

// ─── Wrappers ─────────────────────────────────────────────────────────────────

function makeWrapper(fetcherFn: (key: string) => Promise<unknown>) {
  return ({ children }: { children: ReactNode }) => (
    <SWRConfig
      value={{
        provider: () => new Map(),
        dedupingInterval: 0,
        suspense: false,
        fetcher: fetcherFn,
      }}
    >
      {children}
    </SWRConfig>
  )
}

function loadingWrapper({ children }: { children: ReactNode }) {
  return (
    <SWRConfig
      value={{
        provider: () => new Map(),
        dedupingInterval: 0,
        suspense: false,
        fetcher: () => new Promise(() => {}),
      }}
    >
      {children}
    </SWRConfig>
  )
}

// ─── Tests ────────────────────────────────────────────────────────────────────

describe('EvidenceItem', () => {
  describe('loading state', () => {
    it('renders loading state when SWR is pending', () => {
      render(<EvidenceItem evidenceId="ev-1" />, { wrapper: loadingWrapper })

      const loading = screen.getByTestId('evidence-item-loading')
      expect(loading).toBeInTheDocument()
      expect(loading).toHaveTextContent('ev-1')
    })
  })

  describe('loaded state', () => {
    it('renders file:line when line is present', async () => {
      const evidence = makeEvidence({ file: '/src/auth/service.ts', line: 42 })
      const Wrapper = makeWrapper((key) => {
        if (key.includes('/api/evidence')) return Promise.resolve(evidence)
        return Promise.resolve({})
      })

      render(<EvidenceItem evidenceId="ev-1" />, { wrapper: Wrapper })

      await waitFor(() => {
        expect(screen.getByTestId('evidence-item')).toBeInTheDocument()
      })
      expect(screen.getByText('/src/auth/service.ts:42')).toBeInTheDocument()
    })

    it('renders file only (no colon) when line is undefined', async () => {
      const evidence = makeEvidence({ file: '/src/config.ts', line: undefined })
      const Wrapper = makeWrapper((key) => {
        if (key.includes('/api/evidence')) return Promise.resolve(evidence)
        return Promise.resolve({})
      })

      render(<EvidenceItem evidenceId="ev-1" />, { wrapper: Wrapper })

      await waitFor(() => {
        expect(screen.getByTestId('evidence-item')).toBeInTheDocument()
      })
      expect(screen.getByText('/src/config.ts')).toBeInTheDocument()
    })

    it('has data-evidence-id attribute on root element', async () => {
      const evidence = makeEvidence({ id: 'ev-42' })
      const Wrapper = makeWrapper((key) => {
        if (key.includes('/api/evidence')) return Promise.resolve(evidence)
        return Promise.resolve({})
      })

      render(<EvidenceItem evidenceId="ev-42" />, { wrapper: Wrapper })

      await waitFor(() => {
        const item = screen.getByTestId('evidence-item')
        expect(item).toHaveAttribute('data-evidence-id', 'ev-42')
      })
    })

    it('renders sourceKind, coupling, and confidence', async () => {
      const evidence = makeEvidence({
        sourceKind: 'ast',
        coupling: 'type-only',
        confidence: 'medium',
      })
      const Wrapper = makeWrapper((key) => {
        if (key.includes('/api/evidence')) return Promise.resolve(evidence)
        return Promise.resolve({})
      })

      render(<EvidenceItem evidenceId="ev-1" />, { wrapper: Wrapper })

      await waitFor(() => {
        expect(screen.getByTestId('evidence-item')).toBeInTheDocument()
      })
      expect(screen.getByText('ast')).toBeInTheDocument()
      expect(screen.getByText('type-only')).toBeInTheDocument()
      expect(screen.getByText('medium')).toBeInTheDocument()
    })
  })
})
