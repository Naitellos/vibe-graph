import type React from 'react'
import { type RightTab, useLayoutStore } from '../state/layout.js'
import { ContextPackView } from './ContextPackView.js'
import { DetailView } from './DetailView.js'
import { EvidenceView } from './EvidenceView.js'
import { PanelHeader } from './PanelHeader.js'

export function RightPanel(): React.JSX.Element {
  const rightActiveTab = useLayoutStore((s) => s.rightActiveTab)

  function handleTabClick(tab: RightTab): void {
    useLayoutStore.getState().setRightActiveTab(tab)
  }

  function renderContent(): React.JSX.Element {
    switch (rightActiveTab) {
      case 'detail':
        return <DetailView />
      case 'evidence':
        return <EvidenceView />
      case 'context-pack':
        return <ContextPackView />
    }
  }

  return (
    <>
      <PanelHeader side="right">
        <div role="tablist" className="cockpit-panel-tabs">
          <button
            type="button"
            role="tab"
            data-active={rightActiveTab === 'detail' ? 'true' : undefined}
            aria-pressed={rightActiveTab === 'detail'}
            onClick={() => handleTabClick('detail')}
          >
            Detail
          </button>
          <button
            type="button"
            role="tab"
            data-active={rightActiveTab === 'evidence' ? 'true' : undefined}
            aria-pressed={rightActiveTab === 'evidence'}
            onClick={() => handleTabClick('evidence')}
          >
            Evidence
          </button>
          <button
            type="button"
            role="tab"
            data-active={rightActiveTab === 'context-pack' ? 'true' : undefined}
            aria-pressed={rightActiveTab === 'context-pack'}
            onClick={() => handleTabClick('context-pack')}
          >
            Context Pack
          </button>
        </div>
      </PanelHeader>
      <div className="cockpit-panel-body">{renderContent()}</div>
    </>
  )
}
