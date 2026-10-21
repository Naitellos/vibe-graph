import { render, screen } from '@testing-library/react'
import { describe, expect, it, vi } from 'vitest'
import { ScanStatusBadge } from './ScanStatusBadge.js'

describe('ScanStatusBadge', () => {
  describe('when builtAt is undefined', () => {
    it('renders no scans yet', () => {
      render(<ScanStatusBadge builtAt={undefined} />)
      expect(screen.getByText('no scans yet')).toBeInTheDocument()
    })
  })

  describe('relative time rendering', () => {
    it('renders 2m ago for builtAt 2 minutes before now', () => {
      const now = new Date('2026-05-25T12:02:00Z')
      render(<ScanStatusBadge builtAt="2026-05-25T12:00:00Z" now={now} />)
      expect(screen.getByText('2m ago')).toBeInTheDocument()
    })

    it('renders just now for builtAt 10 seconds before now', () => {
      const now = new Date('2026-05-25T12:00:10Z')
      render(<ScanStatusBadge builtAt="2026-05-25T12:00:00Z" now={now} />)
      expect(screen.getByText('just now')).toBeInTheDocument()
    })
  })

  describe('no console errors', () => {
    it('renders without console.error when builtAt is valid', () => {
      const spy = vi.spyOn(console, 'error')
      const now = new Date('2026-05-25T12:02:00Z')
      render(<ScanStatusBadge builtAt="2026-05-25T12:00:00Z" now={now} />)
      expect(spy.mock.calls.length).toBe(0)
      spy.mockRestore()
    })
  })
})
