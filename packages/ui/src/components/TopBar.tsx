import type React from 'react'
import { useOverview } from '../state/snapshot.js'
import { ScanStatusBadge } from './ScanStatusBadge.js'
import './TopBar.css'
import { ThemeToggle } from './ThemeToggle.js'

export function TopBar(): React.JSX.Element {
  const { data } = useOverview()

  const projectName = data?.project?.name ?? 'Vibe Graph'
  const builtAt = data?.project?.snapshotBuiltAt

  return (
    <header data-testid="topbar" className="topbar">
      <span className="topbar__project-name">{projectName}</span>
      <span className="topbar__separator" aria-hidden="true">
        ·
      </span>
      <ScanStatusBadge builtAt={builtAt} />
      <ThemeToggle />
    </header>
  )
}
