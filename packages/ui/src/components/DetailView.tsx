import type React from 'react'
import { useSelectionStore } from '../state/selection.js'
import { EdgeDetailCard } from './EdgeDetailCard.js'
import { NodeDetailCard } from './NodeDetailCard.js'
import { ProjectOverviewCard } from './ProjectOverviewCard.js'

export function DetailView(): React.JSX.Element {
  const selectedNodeId = useSelectionStore((s) => s.selectedNodeId)
  const selectedEdgeId = useSelectionStore((s) => s.selectedEdgeId)

  if (selectedEdgeId !== null) {
    return <EdgeDetailCard />
  }

  if (selectedNodeId !== null) {
    return <NodeDetailCard />
  }

  return <ProjectOverviewCard />
}
