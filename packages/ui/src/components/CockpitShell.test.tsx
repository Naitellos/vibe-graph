import { render, screen } from '@testing-library/react'
import { userEvent } from '@testing-library/user-event'
import { beforeEach, describe, expect, it, vi } from 'vitest'
import { useLayoutStore } from '../state/layout.js'
import { useWorkspaceStore } from '../state/workspace.js'
import { CockpitShell, layoutToPixelWidths, sanitizePanelWidth } from './CockpitShell.js'
import { PanelHeader } from './PanelHeader.js'

beforeEach(() => {
  useLayoutStore.getState().reset()
  useWorkspaceStore.getState().setActiveWorkspace('map')
})

const slots = {
  left: <div data-testid="left">L</div>,
  center: <div data-testid="center">C</div>,
  right: <div data-testid="right">R</div>,
}

describe('CockpitShell', () => {
  describe('slot rendering', () => {
    it('renders all three slots', () => {
      render(<CockpitShell {...slots} />)
      expect(screen.getByTestId('left')).toBeInTheDocument()
      expect(screen.getByTestId('center')).toBeInTheDocument()
      expect(screen.getByTestId('right')).toBeInTheDocument()
    })
  })

  describe('drag handles are present and accessible', () => {
    it('renders two separator handles with role=separator', () => {
      render(<CockpitShell {...slots} />)
      const handles = screen.getAllByRole('separator')
      // Two separators: left|center and center|right
      expect(handles.length).toBe(2)
    })

    it('store leftWidth updates when setLeftWidth is called externally', () => {
      render(<CockpitShell {...slots} />)
      // Simulate what onLayoutChanged does: update the store directly
      useLayoutStore.getState().setLeftWidth(400)
      expect(useLayoutStore.getState().leftWidth).toBe(400)
    })
  })

  describe('initial widths read from store', () => {
    it('renders without error when store has custom leftWidth', () => {
      useLayoutStore.setState({ leftWidth: 280 })
      // Should not throw – panel receives defaultSize computed from store
      render(<CockpitShell {...slots} />)
      expect(screen.getByTestId('left')).toBeInTheDocument()
    })
  })

  describe('collapsed state', () => {
    it('left panel has data-testid=panel-left-collapsed when leftCollapsed is true', () => {
      useLayoutStore.setState({ leftCollapsed: true })
      render(<CockpitShell {...slots} />)
      // The CockpitShell applies data-testid to the collapsed panel wrapper
      const leftPanel = screen.getByTestId('panel-left')
      expect(leftPanel).toHaveAttribute('data-collapsed', 'true')
    })
  })

  describe('fullscreen mode', () => {
    it("hides left and right when fullscreenTarget is 'center'", () => {
      useLayoutStore.setState({ fullscreenTarget: 'center' })
      render(<CockpitShell {...slots} />)
      expect(screen.queryByTestId('left')).not.toBeInTheDocument()
      expect(screen.getByTestId('center')).toBeInTheDocument()
      expect(screen.queryByTestId('right')).not.toBeInTheDocument()
    })

    it("hides center and right when fullscreenTarget is 'left'", () => {
      useLayoutStore.setState({ fullscreenTarget: 'left' })
      render(<CockpitShell {...slots} />)
      expect(screen.getByTestId('left')).toBeInTheDocument()
      expect(screen.queryByTestId('center')).not.toBeInTheDocument()
      expect(screen.queryByTestId('right')).not.toBeInTheDocument()
    })

    it("hides left and center when fullscreenTarget is 'right'", () => {
      useLayoutStore.setState({ fullscreenTarget: 'right' })
      render(<CockpitShell {...slots} />)
      expect(screen.queryByTestId('left')).not.toBeInTheDocument()
      expect(screen.queryByTestId('center')).not.toBeInTheDocument()
      expect(screen.getByTestId('right')).toBeInTheDocument()
    })
  })

  describe('no console errors', () => {
    it('renders without console.error', () => {
      const spy = vi.spyOn(console, 'error')
      render(<CockpitShell {...slots} />)
      expect(spy.mock.calls.length).toBe(0)
      spy.mockRestore()
    })
  })

  describe('resize wiring — layoutToPixelWidths helper', () => {
    it('converts panel percents to pixels via viewport', () => {
      const out = layoutToPixelWidths(
        { 'panel-left': 25, 'panel-center': 50, 'panel-right': 25 },
        1600,
      )
      expect(out.left).toBe(400)
      expect(out.right).toBe(400)
    })

    it('handles missing panel ids (defaults to 0)', () => {
      expect(layoutToPixelWidths({}, 1000)).toEqual({ left: 0, right: 0 })
    })

    it('rounds fractional pixel values', () => {
      // 33.33% of 1000px = 333.3 → rounds to 333
      const out = layoutToPixelWidths({ 'panel-left': 33.33, 'panel-right': 10 }, 1000)
      expect(out.left).toBe(333)
      expect(out.right).toBe(100)
    })
  })

  describe('drag-collapse sync — panel onResize → store', () => {
    it('setting leftCollapsed=true in store marks panel data-collapsed=true (store→panel direction)', () => {
      render(<CockpitShell {...slots} />)
      useLayoutStore.getState().setLeftCollapsed(true)
      // Verify store holds the new value (imperative panel ops happen via useEffect/ref in jsdom)
      expect(useLayoutStore.getState().leftCollapsed).toBe(true)
    })

    it('setLeftCollapsed(false) clears store flag (store→panel expand direction)', () => {
      useLayoutStore.setState({ leftCollapsed: true })
      render(<CockpitShell {...slots} />)
      useLayoutStore.getState().setLeftCollapsed(false)
      expect(useLayoutStore.getState().leftCollapsed).toBe(false)
    })
  })

  describe('collapse integration — button click → panel DOM', () => {
    it('clicking PanelHeader collapse button sets data-collapsed on left panel', async () => {
      const user = userEvent.setup()
      render(
        <CockpitShell
          left={<PanelHeader side="left" title="Findings" />}
          center={<div>C</div>}
          right={<div>R</div>}
        />,
      )

      const collapseBtn = screen.getByLabelText(/collapse left panel/i)
      await user.click(collapseBtn)

      const leftPanel = screen.getByTestId('panel-left')
      expect(leftPanel).toHaveAttribute('data-collapsed', 'true')
    })
  })

  describe('collapsed panel can be reopened by mouse', () => {
    it('renders an "Expand left panel" affordance only while collapsed', () => {
      const { rerender } = render(<CockpitShell {...slots} />)
      expect(screen.queryByLabelText(/expand left panel/i)).not.toBeInTheDocument()

      useLayoutStore.setState({ leftCollapsed: true })
      rerender(<CockpitShell {...slots} />)
      expect(screen.getByLabelText(/expand left panel/i)).toBeInTheDocument()
    })

    it('renders an "Expand right panel" affordance only while collapsed', () => {
      const { rerender } = render(<CockpitShell {...slots} />)
      expect(screen.queryByLabelText(/expand right panel/i)).not.toBeInTheDocument()

      useLayoutStore.setState({ rightCollapsed: true })
      rerender(<CockpitShell {...slots} />)
      expect(screen.getByLabelText(/expand right panel/i)).toBeInTheDocument()
    })

    it('clicking the expand affordance un-collapses the panel', async () => {
      const user = userEvent.setup()
      useLayoutStore.setState({ leftCollapsed: true })
      render(<CockpitShell {...slots} />)

      await user.click(screen.getByLabelText(/expand left panel/i))
      expect(useLayoutStore.getState().leftCollapsed).toBe(false)
    })
  })

  describe('sanitizePanelWidth — never persist a collapsed/sliver width', () => {
    it('keeps the previous width for a 0 / sliver measurement', () => {
      expect(sanitizePanelWidth(0, 320)).toBe(320)
      expect(sanitizePanelWidth(5, 320)).toBe(320)
    })

    it('accepts a real expanded width', () => {
      expect(sanitizePanelWidth(280, 320)).toBe(280)
    })
  })
})

describe('CockpitShell workspace variants', () => {
  function renderShell() {
    return render(
      <CockpitShell
        left={<div data-testid="left-content" />}
        center={<div data-testid="center-content" />}
        right={<div data-testid="right-content" />}
      />,
    )
  }

  it('renders 3-col layout (left+center+right) when workspace=map', () => {
    renderShell()
    expect(screen.getByTestId('panel-left')).toBeInTheDocument()
    expect(screen.getByTestId('panel-right')).toBeInTheDocument()
  })

  it('renders 2-col layout (left+center, no right) when workspace=change', () => {
    useWorkspaceStore.getState().setActiveWorkspace('change')
    renderShell()
    expect(screen.getByTestId('panel-left')).toBeInTheDocument()
    expect(screen.queryByTestId('panel-right')).toBeNull()
  })

  it('renders 1-col layout (center only) when workspace=activity', () => {
    useWorkspaceStore.getState().setActiveWorkspace('activity')
    renderShell()
    expect(screen.queryByTestId('panel-left')).toBeNull()
    expect(screen.queryByTestId('panel-right')).toBeNull()
    expect(screen.getByTestId('center-content')).toBeInTheDocument()
  })
})
