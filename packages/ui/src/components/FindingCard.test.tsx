import type { Finding } from '@codearch/core'
import { render, screen } from '@testing-library/react'
import { userEvent } from '@testing-library/user-event'
import { type MockInstance, afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import { useSelectionStore } from '../state/selection.js'
import { FindingCard } from './FindingCard.js'

const STUB_FINDING: Finding = {
  id: 'finding-1',
  domain: 'architecture',
  type: 'cycle',
  detectorId: 'core/cycles',
  severity: 'high',
  title: 'Circular dependency detected',
  summary: 'A cycle exists between modules',
  involvedNodeIds: ['node-a', 'node-b', 'node-c'],
  evidenceIds: [],
  status: 'open',
  metadata: {},
}

beforeEach(() => {
  useSelectionStore.getState().clear()
})

describe('FindingCard', () => {
  describe('renders finding content', () => {
    it('renders the finding title', () => {
      render(<FindingCard finding={STUB_FINDING} selected={false} />)
      expect(screen.getByText('Circular dependency detected')).toBeInTheDocument()
    })

    it('renders severity badge', () => {
      render(<FindingCard finding={STUB_FINDING} selected={false} />)
      expect(screen.getByText('high')).toBeInTheDocument()
    })

    it('renders node count', () => {
      render(<FindingCard finding={STUB_FINDING} selected={false} />)
      expect(screen.getByText('3 nodes')).toBeInTheDocument()
    })
  })

  describe('click interaction', () => {
    it('click calls setSelectedFinding with finding.id', async () => {
      const user = userEvent.setup()
      render(<FindingCard finding={STUB_FINDING} selected={false} />)
      const card = screen.getByRole('button', { name: /circular dependency detected/i })
      await user.click(card)
      expect(useSelectionStore.getState().selectedFindingId).toBe('finding-1')
    })
  })

  describe('keyboard interaction', () => {
    it('Enter key calls setSelectedFinding', async () => {
      const user = userEvent.setup()
      render(<FindingCard finding={STUB_FINDING} selected={false} />)
      const card = screen.getByRole('button', { name: /circular dependency detected/i })
      card.focus()
      await user.keyboard('{Enter}')
      expect(useSelectionStore.getState().selectedFindingId).toBe('finding-1')
    })

    it('Space key calls setSelectedFinding', async () => {
      const user = userEvent.setup()
      render(<FindingCard finding={STUB_FINDING} selected={false} />)
      const card = screen.getByRole('button', { name: /circular dependency detected/i })
      card.focus()
      await user.keyboard(' ')
      expect(useSelectionStore.getState().selectedFindingId).toBe('finding-1')
    })
  })

  describe('selected prop', () => {
    it('data-selected is "true" when selected=true', () => {
      const { container } = render(<FindingCard finding={STUB_FINDING} selected={true} />)
      const article = container.querySelector('article')
      expect(article).toHaveAttribute('data-selected', 'true')
    })

    it('data-selected is absent when selected=false', () => {
      const { container } = render(<FindingCard finding={STUB_FINDING} selected={false} />)
      const article = container.querySelector('article')
      expect(article).not.toHaveAttribute('data-selected')
    })
  })

  describe('accessibility', () => {
    it('has role="button" for main card button', () => {
      render(<FindingCard finding={STUB_FINDING} selected={false} />)
      expect(
        screen.getByRole('button', { name: /circular dependency detected/i }),
      ).toBeInTheDocument()
    })

    it('has aria-label describing the finding', () => {
      render(<FindingCard finding={STUB_FINDING} selected={false} />)
      const card = screen.getByRole('button', { name: /circular dependency detected/i })
      expect(card).toHaveAttribute('aria-label', 'high architecture: Circular dependency detected')
    })

    it('has data-finding-id attribute on article', () => {
      const { container } = render(<FindingCard finding={STUB_FINDING} selected={false} />)
      const article = container.querySelector('article')
      expect(article).toHaveAttribute('data-finding-id', 'finding-1')
    })
  })

  describe('Accept/Ignore actions', () => {
    let fetchSpy: MockInstance<typeof fetch>

    beforeEach(() => {
      fetchSpy = vi
        .spyOn(globalThis, 'fetch')
        .mockResolvedValue(new Response('{"ok":true}', { status: 200 }))
    })

    afterEach(() => {
      fetchSpy.mockRestore()
    })

    it('renders Accept and Ignore buttons', () => {
      render(<FindingCard finding={STUB_FINDING} selected={false} />)
      expect(screen.getByRole('button', { name: /accept/i })).toBeInTheDocument()
      expect(screen.getByRole('button', { name: /ignore/i })).toBeInTheDocument()
    })

    it('clicking Accept POSTs to /api/findings/<id>/status with status: accepted', async () => {
      const user = userEvent.setup()
      render(<FindingCard finding={STUB_FINDING} selected={false} />)
      const acceptBtn = screen.getByRole('button', { name: /accept/i })
      await user.click(acceptBtn)
      expect(fetchSpy).toHaveBeenCalledWith(
        '/api/findings/finding-1/status',
        expect.objectContaining({
          method: 'POST',
          headers: expect.objectContaining({ 'Content-Type': 'application/json' }),
          body: JSON.stringify({ status: 'accepted' }),
        }),
      )
    })

    it('clicking Ignore POSTs status: ignored', async () => {
      const user = userEvent.setup()
      render(<FindingCard finding={STUB_FINDING} selected={false} />)
      const ignoreBtn = screen.getByRole('button', { name: /ignore/i })
      await user.click(ignoreBtn)
      expect(fetchSpy).toHaveBeenCalledWith(
        '/api/findings/finding-1/status',
        expect.objectContaining({
          method: 'POST',
          body: JSON.stringify({ status: 'ignored' }),
        }),
      )
    })

    it('optimistic update: clicking Accept changes the rendered status pill immediately', async () => {
      const user = userEvent.setup()
      render(<FindingCard finding={STUB_FINDING} selected={false} />)
      const acceptBtn = screen.getByRole('button', { name: /accept/i })
      await user.click(acceptBtn)
      // After click, the card should show "accepted" status
      expect(await screen.findByText('accepted')).toBeInTheDocument()
    })

    it('rollback on fetch failure', async () => {
      const user = userEvent.setup()
      fetchSpy.mockRejectedValueOnce(new Error('Network error'))
      render(<FindingCard finding={STUB_FINDING} selected={false} />)
      const acceptBtn = screen.getByRole('button', { name: /accept/i })
      await user.click(acceptBtn)
      // Status should revert to original "open" after failure
      expect(screen.getByText('open')).toBeInTheDocument()
    })

    it('preserves colon-heavy finding.id in fetch path (raw, not URL-encoded)', async () => {
      // Backend route matches via prefix+slice on req.pathname (raw, undecoded);
      // colons are valid in URL path segments per RFC 3986. Encoding them would
      // produce a literal `%3A` substring that never matches `f.id` in the snapshot.
      const user = userEvent.setup()
      const findingWithColons: Finding = {
        ...STUB_FINDING,
        id: 'drift:stale:a:b',
      }
      render(<FindingCard finding={findingWithColons} selected={false} />)
      const acceptBtn = screen.getByRole('button', { name: /accept/i })
      await user.click(acceptBtn)
      expect(fetchSpy).toHaveBeenCalledWith(
        '/api/findings/drift:stale:a:b/status',
        expect.any(Object),
      )
    })
  })
})
