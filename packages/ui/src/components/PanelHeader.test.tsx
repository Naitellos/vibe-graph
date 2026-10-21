import { render, screen } from '@testing-library/react'
import { userEvent } from '@testing-library/user-event'
import { beforeEach, describe, expect, it, vi } from 'vitest'
import { useLayoutStore } from '../state/layout.js'
import { PanelHeader } from './PanelHeader.js'

beforeEach(() => {
  useLayoutStore.getState().reset()
})

describe('PanelHeader', () => {
  describe('collapse button – left side', () => {
    it('toggles leftCollapsed true then false', async () => {
      const user = userEvent.setup()
      render(<PanelHeader side="left" />)
      const collapseBtn = screen.getByRole('button', { name: /collapse left panel/i })

      await user.click(collapseBtn)
      expect(useLayoutStore.getState().leftCollapsed).toBe(true)

      await user.click(collapseBtn)
      expect(useLayoutStore.getState().leftCollapsed).toBe(false)
    })
  })

  describe('collapse button – right side', () => {
    it('toggles rightCollapsed true then false', async () => {
      const user = userEvent.setup()
      render(<PanelHeader side="right" />)
      const collapseBtn = screen.getByRole('button', { name: /collapse right panel/i })

      await user.click(collapseBtn)
      expect(useLayoutStore.getState().rightCollapsed).toBe(true)

      await user.click(collapseBtn)
      expect(useLayoutStore.getState().rightCollapsed).toBe(false)
    })
  })

  describe('fullscreen button – right side', () => {
    it('toggles fullscreenTarget to right then back to null', async () => {
      const user = userEvent.setup()
      render(<PanelHeader side="right" />)
      const fsBtn = screen.getByRole('button', { name: /toggle fullscreen for right panel/i })

      await user.click(fsBtn)
      expect(useLayoutStore.getState().fullscreenTarget).toBe('right')

      await user.click(fsBtn)
      expect(useLayoutStore.getState().fullscreenTarget).toBeNull()
    })
  })

  describe('fullscreen button – left side', () => {
    it('toggles fullscreenTarget to left then back to null', async () => {
      const user = userEvent.setup()
      render(<PanelHeader side="left" />)
      const fsBtn = screen.getByRole('button', { name: /toggle fullscreen for left panel/i })

      await user.click(fsBtn)
      expect(useLayoutStore.getState().fullscreenTarget).toBe('left')

      await user.click(fsBtn)
      expect(useLayoutStore.getState().fullscreenTarget).toBeNull()
    })
  })

  describe('ARIA labels', () => {
    it('collapse and fullscreen buttons have accessible names', () => {
      render(<PanelHeader side="left" />)
      expect(screen.getByLabelText(/collapse/i)).toBeInTheDocument()
      expect(screen.getByLabelText(/fullscreen/i)).toBeInTheDocument()
    })
  })

  describe('title and children', () => {
    it('renders title and slot children', () => {
      render(
        <PanelHeader side="left" title="Findings">
          <div data-testid="tabs">TABS</div>
        </PanelHeader>,
      )
      expect(screen.getByText('Findings')).toBeInTheDocument()
      expect(screen.getByTestId('tabs')).toBeInTheDocument()
    })
  })

  describe('no console errors', () => {
    it('renders without console.error', () => {
      const spy = vi.spyOn(console, 'error')
      render(<PanelHeader side="left" />)
      expect(spy.mock.calls.length).toBe(0)
      spy.mockRestore()
    })
  })
})
