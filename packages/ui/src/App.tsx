import type React from 'react'
import { SWRConfig } from 'swr'
import { CenterWorkspace } from './components/CenterWorkspace.js'
import { CockpitShell } from './components/CockpitShell.js'
import { CommandPalette } from './components/CommandPalette.js'
import { LeftPanel } from './components/LeftPanel.js'
import { OnboardingBanner } from './components/OnboardingBanner.js'
import { RightPanel } from './components/RightPanel.js'
import { ToastBar } from './components/ToastBar.js'
import { TopBar } from './components/TopBar.js'
import { useKeyboardShortcuts } from './hooks/use-keyboard-shortcuts.js'
import { swrConfig, useSnapshot } from './state/snapshot.js'
import { useUrlState } from './state/url.js'

export function App(): React.JSX.Element {
  useUrlState()
  useKeyboardShortcuts()
  const { data: snapshot } = useSnapshot()

  // Check if any edge has 'yaml' source, indicating curated YAML exists
  const hasCuratedSubsystems = (snapshot?.edges ?? []).some((e) => e.source === 'yaml')

  return (
    <SWRConfig value={swrConfig}>
      <div className="app">
        <OnboardingBanner hasCuratedSubsystems={hasCuratedSubsystems} />
        <TopBar />
        <CockpitShell left={<LeftPanel />} center={<CenterWorkspace />} right={<RightPanel />} />
        <ToastBar />
        <CommandPalette />
      </div>
    </SWRConfig>
  )
}
