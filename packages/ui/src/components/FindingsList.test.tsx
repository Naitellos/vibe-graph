import type { Finding, Snapshot } from '@codearch/core'
import { render, screen, waitFor } from '@testing-library/react'
import { userEvent } from '@testing-library/user-event'
import type { ReactNode } from 'react'
import { SWRConfig } from 'swr'
import { beforeEach, describe, expect, it } from 'vitest'
import { useLayoutStore } from '../state/layout.js'
import { useSelectionStore } from '../state/selection.js'
import { FindingsList } from './FindingsList.js'

// ─── Fixtures ─────────────────────────────────────────────────────────────────

function makeSnapshot(findings: Finding[]): Snapshot {
  return {
    meta: {
      schemaVersion: '0.1.0',
      scanId: '00000000-0000-0000-0000-000000000000',
      builtAt: '2024-01-01T00:00:00.000Z',
      projectRoot: '/test',
      projectName: 'test',
      vibegraphVersion: '0.0.0',
      scanDurationMs: 0,
      fileCounts: { scanned: 0, indexed: 0, skipped: 0 },
    },
    nodes: [],
    edges: [],
    evidence: [],
    findings,
  }
}

function makeFinding(
  id: string,
  severity: Finding['severity'],
  domain: Finding['domain'],
  involvedNodeIds: string[] = ['a'],
  status: Finding['status'] = 'open',
): Finding {
  return {
    id,
    domain,
    type: 'cycle',
    detectorId: 'test',
    severity,
    title: `Finding ${id}`,
    summary: 'test',
    involvedNodeIds,
    evidenceIds: [],
    status,
    metadata: {},
  }
}

const THREE_FINDINGS = [
  makeFinding('low-1', 'low', 'architecture'),
  makeFinding('high-1', 'high', 'security'),
  makeFinding('med-1', 'medium', 'drift'),
]

// ─── Test wrapper ─────────────────────────────────────────────────────────────

function makeWrapper(findings: Finding[]) {
  const snapshot = makeSnapshot(findings)
  return ({ children }: { children: ReactNode }) => (
    <SWRConfig
      value={{
        provider: () => new Map(),
        dedupingInterval: 0,
        suspense: false,
        fetcher: async () => snapshot,
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

// ─── Tests ───────────────────────────────────────────────────────────────────

beforeEach(() => {
  useSelectionStore.getState().clear()
  useLayoutStore.getState().reset()
})

describe('FindingsList', () => {
  describe('loading state', () => {
    it('renders loading indicator while data is undefined', () => {
      render(<FindingsList />, { wrapper: loadingWrapper })
      expect(screen.getByText(/loading findings/i)).toBeInTheDocument()
    })
  })

  describe('sorted rendering', () => {
    it('renders 3 findings sorted: high on top, low at bottom', async () => {
      const Wrapper = makeWrapper(THREE_FINDINGS)
      render(<FindingsList />, { wrapper: Wrapper })
      await waitFor(() => screen.getAllByRole('button', { name: /finding/i }))
      const buttons = screen.getAllByRole('button', { name: /finding/i })
      const cards = buttons.map((btn) => btn.closest('article'))
      expect(cards[0]).toHaveAttribute('data-finding-id', 'high-1')
      expect(cards[1]).toHaveAttribute('data-finding-id', 'med-1')
      expect(cards[2]).toHaveAttribute('data-finding-id', 'low-1')
    })
  })

  describe('click card → selection store', () => {
    it('clicking a card updates selectedFindingId in selection store', async () => {
      const user = userEvent.setup()
      const Wrapper = makeWrapper(THREE_FINDINGS)
      render(<FindingsList />, { wrapper: Wrapper })
      await waitFor(() => screen.getAllByRole('button', { name: /finding/i }))

      const highCard = screen.getByRole('button', { name: /high security/i })
      await user.click(highCard)
      expect(useSelectionStore.getState().selectedFindingId).toBe('high-1')
    })
  })

  describe('domain filter', () => {
    it('clicking a domain tab hides non-matching findings', async () => {
      const user = userEvent.setup()
      const Wrapper = makeWrapper(THREE_FINDINGS)
      render(<FindingsList />, { wrapper: Wrapper })
      await waitFor(() => screen.getAllByRole('button', { name: /finding/i }))

      // Click "Security" tab
      await user.click(screen.getByRole('button', { name: 'Security' }))

      // Only security finding should be visible
      expect(screen.getByRole('button', { name: /high security/i })).toBeInTheDocument()
      expect(screen.queryByRole('button', { name: /medium drift/i })).not.toBeInTheDocument()
      expect(screen.queryByRole('button', { name: /low architecture/i })).not.toBeInTheDocument()
    })

    it('renders empty state message when filtered domain has no findings', async () => {
      const user = userEvent.setup()
      const Wrapper = makeWrapper(THREE_FINDINGS)
      render(<FindingsList />, { wrapper: Wrapper })
      await waitFor(() => screen.getAllByRole('button', { name: /finding/i }))

      // Click "Tests" tab — no test findings
      await user.click(screen.getByRole('button', { name: 'Tests' }))
      expect(screen.getByText(/no findings yet/i)).toBeInTheDocument()
    })
  })

  describe('Rule violations chip and ruleId badge', () => {
    it('renders a "Rule violations" tab button in DomainTabs', async () => {
      const Wrapper = makeWrapper(THREE_FINDINGS)
      render(<FindingsList />, { wrapper: Wrapper })
      await waitFor(() => screen.getAllByRole('button', { name: /finding/i }))
      expect(screen.getByRole('button', { name: 'Rule violations' })).toBeInTheDocument()
    })

    it('clicking "Rule violations" filters to only rule findings', async () => {
      const user = userEvent.setup()
      const findings = [
        makeFinding('arch-1', 'medium', 'architecture'),
        makeFinding('drift-1', 'low', 'drift'),
        makeFinding('rule-1', 'high', 'rule'),
      ]
      const Wrapper = makeWrapper(findings)
      render(<FindingsList />, { wrapper: Wrapper })
      await waitFor(() => screen.getAllByRole('button', { name: /finding/i }))

      await user.click(screen.getByRole('button', { name: 'Rule violations' }))

      expect(screen.getByRole('button', { name: /finding rule-1/i })).toBeInTheDocument()
      expect(screen.queryByRole('button', { name: /finding arch-1/i })).not.toBeInTheDocument()
      expect(screen.queryByRole('button', { name: /finding drift-1/i })).not.toBeInTheDocument()
    })

    it('renders ruleId badge on rule findings', async () => {
      const ruleFinding: Finding = {
        id: 'rule-badge-1',
        domain: 'rule',
        type: 'cycle',
        detectorId: 'builtin:no-layer-violation',
        severity: 'high',
        title: 'Finding rule-badge-1',
        summary: 'test',
        involvedNodeIds: ['a'],
        evidenceIds: [],
        status: 'open',
        metadata: { ruleId: 'builtin:no-layer-violation' },
      }
      const Wrapper = makeWrapper([ruleFinding])
      render(<FindingsList />, { wrapper: Wrapper })
      await waitFor(() => screen.getByTestId('rule-id-badge'))
      expect(screen.getByTestId('rule-id-badge')).toHaveTextContent('builtin:no-layer-violation')
    })

    it('does not render ruleId badge on non-rule findings', async () => {
      const Wrapper = makeWrapper(THREE_FINDINGS)
      render(<FindingsList />, { wrapper: Wrapper })
      await waitFor(() => screen.getAllByRole('button', { name: /finding/i }))
      expect(screen.queryByTestId('rule-id-badge')).not.toBeInTheDocument()
    })
  })

  describe('Drift filter with status handling', () => {
    it('clicking Drift chip filters findings to domain==="drift" with status==="open"', async () => {
      const user = userEvent.setup()
      const findings = [
        makeFinding('f1', 'medium', 'architecture', ['a'], 'open'),
        makeFinding('f2', 'medium', 'drift', ['a'], 'open'),
        makeFinding('f3', 'medium', 'drift', ['a'], 'accepted'),
      ]
      const Wrapper = makeWrapper(findings)
      render(<FindingsList />, { wrapper: Wrapper })
      await waitFor(() => screen.getAllByRole('button', { name: /finding/i }))

      // Click "Drift" tab
      await user.click(screen.getByRole('button', { name: 'Drift' }))

      // Only open drift finding should be visible (f2)
      expect(screen.getByRole('button', { name: /Finding f2/i })).toBeInTheDocument()
      // Cycle finding should be hidden (wrong domain)
      expect(screen.queryByRole('button', { name: /Finding f1/i })).not.toBeInTheDocument()
      // Accepted drift finding should be hidden (status=accepted, default hidden)
      expect(screen.queryByRole('button', { name: /Finding f3/i })).not.toBeInTheDocument()
    })

    it('"Show accepted" toggle includes accepted/ignored drift findings', async () => {
      const user = userEvent.setup()
      const findings = [
        makeFinding('f1', 'medium', 'architecture', ['a'], 'open'),
        makeFinding('f2', 'medium', 'drift', ['a'], 'open'),
        makeFinding('f3', 'medium', 'drift', ['a'], 'accepted'),
        makeFinding('f4', 'medium', 'drift', ['a'], 'ignored'),
      ]
      const Wrapper = makeWrapper(findings)
      render(<FindingsList />, { wrapper: Wrapper })
      await waitFor(() => screen.getAllByRole('button', { name: /finding/i }))

      // Click "Drift" tab
      await user.click(screen.getByRole('button', { name: 'Drift' }))

      // Only open drift finding should be visible initially
      expect(screen.getByRole('button', { name: /Finding f2/i })).toBeInTheDocument()
      expect(screen.queryByRole('button', { name: /Finding f3/i })).not.toBeInTheDocument()
      expect(screen.queryByRole('button', { name: /Finding f4/i })).not.toBeInTheDocument()

      // Click "Show accepted" toggle
      const showAcceptedBtn = screen.getByRole('button', { name: /show accepted/i })
      expect(showAcceptedBtn).toHaveTextContent('Show accepted (2)')
      await user.click(showAcceptedBtn)

      // Now open AND accepted/ignored drift findings should be visible
      expect(screen.getByRole('button', { name: /Finding f2/i })).toBeInTheDocument()
      expect(screen.getByRole('button', { name: /Finding f3/i })).toBeInTheDocument()
      expect(screen.getByRole('button', { name: /Finding f4/i })).toBeInTheDocument()
    })
  })
})
