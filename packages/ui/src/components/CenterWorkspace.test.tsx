import { render, screen } from '@testing-library/react'
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import { useWorkspaceStore } from '../state/workspace.js'
import { CenterWorkspace } from './CenterWorkspace.js'

vi.mock('../canvas/GraphCanvas.js', () => ({
  GraphCanvas: () => <div data-testid="graph-canvas-mock" />,
}))
vi.mock('./ChangeMode.js', () => ({ ChangeMode: () => <div data-testid="change-mode-mock" /> }))
vi.mock('./ActivityLog.js', () => ({ ActivityLog: () => <div data-testid="activity-log-mock" /> }))

beforeEach(() => {
  useWorkspaceStore.setState({ activeWorkspace: 'map' })
})

afterEach(() => {
  useWorkspaceStore.setState({ activeWorkspace: 'map' })
})

describe('CenterWorkspace', () => {
  describe('root element', () => {
    it('renders root element with data-testid="center-workspace"', () => {
      render(<CenterWorkspace />)
      expect(screen.getByTestId('center-workspace')).toBeInTheDocument()
    })
  })

  describe('WorkspaceSelector integration', () => {
    it('renders the Map button from WorkspaceSelector', () => {
      render(<CenterWorkspace />)
      expect(screen.getByRole('button', { name: /map/i })).toBeInTheDocument()
    })

    it('renders the Flow button from WorkspaceSelector', () => {
      render(<CenterWorkspace />)
      expect(screen.getByRole('button', { name: /flow/i })).toBeInTheDocument()
    })
  })

  describe('GraphCanvas integration', () => {
    it('renders the graph-canvas element when workspace=map', () => {
      render(<CenterWorkspace />)
      expect(screen.getByTestId('graph-canvas-mock')).toBeInTheDocument()
    })
  })

  describe('layout structure', () => {
    it('root has center-workspace class so flex layout in CSS applies', () => {
      const { container } = render(<CenterWorkspace />)
      const root = container.querySelector('[data-testid="center-workspace"]')
      expect(root?.className).toContain('center-workspace')
    })

    it('wraps GraphCanvas in vg-canvas-wrapper so SVG can size to remaining space', () => {
      const { container } = render(<CenterWorkspace />)
      const wrapper = container.querySelector('.vg-canvas-wrapper')
      expect(wrapper).not.toBeNull()
      const graphCanvas = wrapper?.querySelector('[data-testid="graph-canvas-mock"]')
      expect(graphCanvas).not.toBeNull()
    })
  })

  describe('workspace switching', () => {
    it('renders GraphCanvas when workspace=map', () => {
      render(<CenterWorkspace />)
      expect(screen.getByTestId('graph-canvas-mock')).toBeInTheDocument()
    })

    it('renders ChangeMode when workspace=change', () => {
      useWorkspaceStore.getState().setActiveWorkspace('change')
      render(<CenterWorkspace />)
      expect(screen.getByTestId('change-mode-mock')).toBeInTheDocument()
    })

    it('renders ActivityLog when workspace=activity', () => {
      useWorkspaceStore.getState().setActiveWorkspace('activity')
      render(<CenterWorkspace />)
      expect(screen.getByTestId('activity-log-mock')).toBeInTheDocument()
    })
  })
})
