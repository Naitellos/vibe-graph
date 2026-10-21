import { render, screen } from '@testing-library/react'
import { userEvent } from '@testing-library/user-event'
import { describe, expect, it, vi } from 'vitest'
import { DomainTabs } from './DomainTabs.js'

describe('DomainTabs', () => {
  describe('renders all tabs', () => {
    it('renders 6 tabs: All, Architecture, Security, Drift, Rule violations, Tests', () => {
      render(<DomainTabs activeDomain="all" onSelect={vi.fn()} />)
      expect(screen.getByRole('button', { name: 'All' })).toBeInTheDocument()
      expect(screen.getByRole('button', { name: 'Architecture' })).toBeInTheDocument()
      expect(screen.getByRole('button', { name: 'Security' })).toBeInTheDocument()
      expect(screen.getByRole('button', { name: 'Drift' })).toBeInTheDocument()
      expect(screen.getByRole('button', { name: 'Rule violations' })).toBeInTheDocument()
      expect(screen.getByRole('button', { name: 'Tests' })).toBeInTheDocument()
    })

    it('does NOT render a Docs tab', () => {
      render(<DomainTabs activeDomain="all" onSelect={vi.fn()} />)
      expect(screen.queryByRole('button', { name: 'Docs' })).not.toBeInTheDocument()
    })
  })

  describe('click calls onSelect', () => {
    it('clicking Security calls onSelect("security")', async () => {
      const user = userEvent.setup()
      const onSelect = vi.fn()
      render(<DomainTabs activeDomain="all" onSelect={onSelect} />)
      await user.click(screen.getByRole('button', { name: 'Security' }))
      expect(onSelect).toHaveBeenCalledWith('security')
    })

    it('clicking All calls onSelect("all")', async () => {
      const user = userEvent.setup()
      const onSelect = vi.fn()
      render(<DomainTabs activeDomain="security" onSelect={onSelect} />)
      await user.click(screen.getByRole('button', { name: 'All' }))
      expect(onSelect).toHaveBeenCalledWith('all')
    })

    it('clicking Architecture calls onSelect("architecture")', async () => {
      const user = userEvent.setup()
      const onSelect = vi.fn()
      render(<DomainTabs activeDomain="all" onSelect={onSelect} />)
      await user.click(screen.getByRole('button', { name: 'Architecture' }))
      expect(onSelect).toHaveBeenCalledWith('architecture')
    })
  })

  describe('active tab attributes', () => {
    it('active tab has data-active="true"', () => {
      render(<DomainTabs activeDomain="security" onSelect={vi.fn()} />)
      const securityBtn = screen.getByRole('button', { name: 'Security' })
      expect(securityBtn).toHaveAttribute('data-active', 'true')
    })

    it('active tab has aria-pressed="true"', () => {
      render(<DomainTabs activeDomain="security" onSelect={vi.fn()} />)
      const securityBtn = screen.getByRole('button', { name: 'Security' })
      expect(securityBtn).toHaveAttribute('aria-pressed', 'true')
    })

    it('inactive tabs do not have data-active="true"', () => {
      render(<DomainTabs activeDomain="security" onSelect={vi.fn()} />)
      const allBtn = screen.getByRole('button', { name: 'All' })
      expect(allBtn).not.toHaveAttribute('data-active', 'true')
    })

    it('"all" domain activates the All button', () => {
      render(<DomainTabs activeDomain="all" onSelect={vi.fn()} />)
      const allBtn = screen.getByRole('button', { name: 'All' })
      expect(allBtn).toHaveAttribute('data-active', 'true')
      expect(allBtn).toHaveAttribute('aria-pressed', 'true')
    })
  })
})
