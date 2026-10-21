import type React from 'react'
import { GraphCanvas } from '../canvas/GraphCanvas.js'
import { useWorkspaceStore } from '../state/workspace.js'
import './CenterWorkspace.css'
import { ActivityLog } from './ActivityLog.js'
import { ChangeMode } from './ChangeMode.js'
import { DiffSummary } from './DiffSummary.js'
import { WorkspaceSelector } from './WorkspaceSelector.js'

export function CenterWorkspace(): React.JSX.Element {
  const active = useWorkspaceStore((s) => s.activeWorkspace)

  return (
    <div data-testid="center-workspace" className="center-workspace">
      <WorkspaceSelector />
      {active === 'map' && <DiffSummary />}
      <div className="vg-canvas-wrapper">
        {active === 'map' && <GraphCanvas />}
        {active === 'change' && <ChangeMode />}
        {active === 'activity' && <ActivityLog />}
      </div>
    </div>
  )
}
