import type React from 'react'
import { useState } from 'react'
import { useSelectionStore } from '../state/selection.js'
import { useOverview, useSnapshot } from '../state/snapshot.js'
import { formatTimeAgo } from '../utils/format-time-ago.js'
import { topHubsByFanIn } from '../utils/top-hubs.js'
import './detail.css'

const MCP_CONFIG_SNIPPET = JSON.stringify(
  {
    mcpServers: {
      vibegraph: {
        command: 'npx',
        args: ['vibe-graph', 'mcp'],
      },
    },
  },
  null,
  2,
)

export function ProjectOverviewCard(): React.JSX.Element {
  const { data: overview } = useOverview()
  const { data: snapshot } = useSnapshot()

  const [scanning, setScanning] = useState(false)
  const [copied, setCopied] = useState(false)

  const projectName = overview?.project?.name ?? '—'
  const counts = overview?.counts
  const builtAt = overview?.project?.snapshotBuiltAt

  // Compute top hubs from snapshot data
  const nodes = snapshot?.nodes ?? []
  const edges = snapshot?.edges ?? []
  const nodesById = new Map(nodes.map((n) => [n.id, n]))
  const hubs = topHubsByFanIn(
    nodes.map((n) => ({ id: n.id, kind: n.kind })),
    edges.map((e) => ({ from: e.from, to: e.to })),
    5,
  )

  function handleRunScan(): void {
    setScanning(true)
    fetch('/api/scan', { method: 'POST' }).catch(() => {
      // fire-and-forget for v0
    })
    setTimeout(() => {
      setScanning(false)
    }, 5000)
  }

  function handleCopyMcpConfig(): void {
    navigator.clipboard
      .writeText(MCP_CONFIG_SNIPPET)
      .then(() => {
        setCopied(true)
        setTimeout(() => {
          setCopied(false)
        }, 2000)
      })
      .catch(() => {
        // silently ignore clipboard errors
      })
  }

  return (
    <div data-testid="project-overview-card">
      <h2>{projectName}</h2>

      <dl className="vg-kv">
        <dt>Subsystems</dt>
        <dd data-testid="count-subsystems">{counts?.subsystems ?? '—'}</dd>
        <dt>Files</dt>
        <dd data-testid="count-files">{counts?.files ?? '—'}</dd>
        <dt>Edges</dt>
        <dd data-testid="count-edges">{counts?.edges ?? '—'}</dd>
        <dt>Findings</dt>
        <dd data-testid="count-findings">{counts?.findings ?? '—'}</dd>
        <dt>External packages</dt>
        <dd data-testid="count-external-packages">{counts?.externalPackages ?? '—'}</dd>
      </dl>

      {builtAt !== undefined && <p data-testid="last-scan">Last scan: {formatTimeAgo(builtAt)}</p>}

      {hubs.length > 0 && (
        <section data-testid="top-hubs">
          <h3>Top hubs</h3>
          <ul className="overview-hubs">
            {hubs.map((hub) => {
              const title = nodesById.get(hub.id)?.title ?? hub.id
              return (
                <li key={hub.id}>
                  <button
                    type="button"
                    className="overview-hub"
                    data-testid={`hub-${hub.id}`}
                    onClick={() => useSelectionStore.getState().setSelectedNode(hub.id)}
                  >
                    {title} ({hub.fanIn})
                  </button>
                </li>
              )
            })}
          </ul>
        </section>
      )}

      <div>
        <button type="button" onClick={handleRunScan} disabled={scanning}>
          {scanning ? 'Scanning…' : 'Run scan'}
        </button>
        <button type="button" onClick={handleCopyMcpConfig}>
          {copied ? 'Copied!' : 'Copy MCP config'}
        </button>
      </div>
    </div>
  )
}
