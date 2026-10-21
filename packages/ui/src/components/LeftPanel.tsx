import type React from 'react'
import { useLayoutStore } from '../state/layout.js'
import { FiltersPanel } from './FiltersPanel.js'
import { FindingsList } from './FindingsList.js'
import { PanelHeader } from './PanelHeader.js'

export function LeftPanel(): React.JSX.Element {
  const leftActiveTab = useLayoutStore((s) => s.leftActiveTab)

  function handleFindingsTab(): void {
    useLayoutStore.getState().setLeftActiveTab('findings')
  }

  function handleFiltersTab(): void {
    useLayoutStore.getState().setLeftActiveTab('filters')
  }

  return (
    <>
      <PanelHeader side="left">
        <div className="cockpit-panel-tabs">
          <button
            type="button"
            data-active={leftActiveTab === 'findings' ? 'true' : undefined}
            onClick={handleFindingsTab}
          >
            Findings
          </button>
          <button
            type="button"
            data-active={leftActiveTab === 'filters' ? 'true' : undefined}
            onClick={handleFiltersTab}
          >
            Filters
          </button>
        </div>
      </PanelHeader>
      <div className="cockpit-panel-body">
        {leftActiveTab === 'findings' ? <FindingsList /> : <FiltersPanel />}
      </div>
    </>
  )
}
