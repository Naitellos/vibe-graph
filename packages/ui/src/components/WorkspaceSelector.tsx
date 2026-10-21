import type React from 'react'
import { useActivityLogStore } from '../state/activity-log.js'
import { useChangeModeStore } from '../state/change-mode.js'
import { useDiffStore } from '../state/diff.js'
import { useWorkspaceStore } from '../state/workspace.js'

export function WorkspaceSelector(): React.JSX.Element {
  const activeWorkspace = useWorkspaceStore((s) => s.activeWorkspace)
  const badgeCount = useActivityLogStore((s) => s.badgeCount)
  const validating = useDiffStore((s) => s.status === 'loading')

  function handleMapClick(): void {
    useWorkspaceStore.getState().setActiveWorkspace('map')
  }

  function handleChangeClick(): void {
    useWorkspaceStore.getState().setActiveWorkspace('change')
  }

  function handleActivityClick(): void {
    useWorkspaceStore.getState().setActiveWorkspace('activity')
    useActivityLogStore.getState().markRead()
  }

  async function handleValidateClick(): Promise<void> {
    const taskId = useChangeModeStore.getState().preparedTask?.taskId
    await useDiffStore.getState().runValidate({ taskId })
    if (useDiffStore.getState().active) {
      useWorkspaceStore.getState().setActiveWorkspace('map')
    }
  }

  return (
    <div data-testid="workspace-selector">
      <button
        type="button"
        data-active={activeWorkspace === 'map' ? 'true' : undefined}
        onClick={handleMapClick}
      >
        Map
      </button>
      <button
        type="button"
        data-active={activeWorkspace === 'change' ? 'true' : undefined}
        onClick={handleChangeClick}
      >
        Change
      </button>
      <button
        type="button"
        data-active={activeWorkspace === 'activity' ? 'true' : undefined}
        onClick={handleActivityClick}
      >
        Activity
        {badgeCount > 0 && <span data-testid="activity-badge">{badgeCount}</span>}
      </button>
      <button
        type="button"
        className="vg-button"
        data-testid="validate-btn"
        disabled={validating}
        onClick={handleValidateClick}
      >
        {validating ? 'Validating…' : 'Validate'}
      </button>
      <button type="button" disabled aria-disabled="true" title="Coming soon">
        Flow
      </button>
      <button type="button" disabled aria-disabled="true" title="Coming soon">
        Security
      </button>
      <button type="button" disabled aria-disabled="true" title="Coming soon">
        Overview
      </button>
    </div>
  )
}
