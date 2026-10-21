import type React from 'react'
import { useSelectionStore } from '../state/selection.js'
import { useNode, useSnapshot } from '../state/snapshot.js'
import { useSubsystemDoc } from '../state/subsystem-docs.js'
import { SubsystemDocView } from './SubsystemDocView.js'
import './detail.css'

export function NodeDetailCard(): React.JSX.Element {
  const selectedNodeId = useSelectionStore((s) => s.selectedNodeId)
  const setSelectedNode = useSelectionStore((s) => s.setSelectedNode)
  const setSelectedFinding = useSelectionStore((s) => s.setSelectedFinding)

  const { data: nodeData, isLoading: nodeLoading } = useNode(selectedNodeId)
  const { data: snapshot, isLoading: snapshotLoading } = useSnapshot()

  // §5.2 — compute slug for subsystem doc lookup
  const docSlug =
    nodeData !== undefined && nodeData.node.kind === 'subsystem'
      ? nodeData.node.id.replace(/^subsystem:/, '')
      : null
  const { data: subsystemDoc } = useSubsystemDoc(docSlug)

  if (nodeLoading || snapshotLoading || nodeData === undefined) {
    return <div data-testid="node-detail-loading">Loading…</div>
  }

  const { node, outgoing, incoming } = nodeData

  // §5.2 — use title over raw id
  const heading = node.title ?? node.id

  // §UX4 — title lookup for legacy edge lists (so "subsystem:core" → "core")
  const allNodes = snapshot?.nodes ?? []
  const titleById = new Map(allNodes.map((n) => [n.id, n.title]))
  const titleOf = (id: string): string => titleById.get(id) ?? id

  const findings = (snapshot?.findings ?? []).filter((f) => f.involvedNodeIds.includes(node.id))

  // §5.3 — split outgoing edges by kind
  const dependsOnEdges = outgoing.filter((e) => e.kind === 'depends_on')
  const containsEdges = outgoing.filter((e) => e.kind === 'contains')
  // Any other outgoing edge kinds fall through to legacy list
  const otherOutgoing = outgoing.filter((e) => e.kind !== 'depends_on' && e.kind !== 'contains')

  // §UX4 / §UX6 — when SubsystemDocView renders, it owns header, layer/status,
  // declared depends_on, declared consumed_by. Suppress the duplicate legacy
  // sections in that case. Keep contains-files collapsible (not duplicated)
  // and findings (drift summary).
  const hasRichDoc = subsystemDoc !== undefined && subsystemDoc !== null

  return (
    <div data-testid="node-detail-card">
      {/* §UX6 — only render h2 when SubsystemDocView isn't going to render its own */}
      {!hasRichDoc && <h2>{heading}</h2>}

      {/* §UX5 — only render dl for non-doc'd nodes; SubsystemDocView's pills cover layer/status */}
      {!hasRichDoc && (
        <dl className="vg-kv">
          <dt>Kind</dt>
          <dd>{node.kind}</dd>
          <dt>Layer</dt>
          <dd>{node.layer}</dd>
          {node.status !== undefined && (
            <>
              <dt>Status</dt>
              <dd>{node.status}</dd>
            </>
          )}
        </dl>
      )}

      {/* §5.2 — SubsystemDocView when doc is loaded */}
      {hasRichDoc && <SubsystemDocView doc={subsystemDoc} />}

      {/* §UX4 — only show legacy "Depends on" when no rich doc (SubsystemDocView covers it) */}
      {!hasRichDoc && dependsOnEdges.length > 0 && (
        <section>
          <h4>Depends on</h4>
          <ul>
            {dependsOnEdges.map((edge) => (
              <li key={edge.id}>
                <button
                  type="button"
                  onClick={() => {
                    setSelectedNode(edge.to)
                  }}
                >
                  {titleOf(edge.to)}
                </button>
              </li>
            ))}
          </ul>
        </section>
      )}

      {/* §5.3 — contains edges in a separate collapsible — kept regardless of doc
          (SubsystemDocView doesn't enumerate files). */}
      {containsEdges.length > 0 && (
        <details>
          <summary>Contains ({containsEdges.length} files)</summary>
          <ul>
            {containsEdges.map((edge) => (
              <li key={edge.id}>
                <button
                  type="button"
                  onClick={() => {
                    setSelectedNode(edge.to)
                  }}
                >
                  {edge.to.replace(/^file:/, '')}
                </button>
              </li>
            ))}
          </ul>
        </details>
      )}

      {/* Legacy: any other outgoing edge kinds (e.g. owns → tables) — keep always */}
      {otherOutgoing.length > 0 && (
        <section>
          <h4>Other outgoing</h4>
          <ul>
            {otherOutgoing.map((edge) => (
              <li key={edge.id}>
                <button
                  type="button"
                  onClick={() => {
                    setSelectedNode(edge.to)
                  }}
                >
                  {titleOf(edge.to)}
                </button>
              </li>
            ))}
          </ul>
        </section>
      )}

      {/* §UX4 — only show legacy "Consumed by" when no rich doc */}
      {!hasRichDoc && incoming.length > 0 && (
        <section>
          <h4>Consumed by</h4>
          <ul>
            {incoming.map((edge) => (
              <li key={edge.id}>
                <button
                  type="button"
                  onClick={() => {
                    setSelectedNode(edge.from)
                  }}
                >
                  {titleOf(edge.from)}
                </button>
              </li>
            ))}
          </ul>
        </section>
      )}

      {node.kind === 'subsystem' && node.files.length > 0 && (
        <section>
          <h4>Files</h4>
          <ul>
            {node.files.map((file) => (
              <li key={file}>{file}</li>
            ))}
          </ul>
        </section>
      )}

      {findings.length > 0 && (
        <section>
          <h4>Findings</h4>
          <ul>
            {findings.map((finding) => (
              <li key={finding.id}>
                <button
                  type="button"
                  onClick={() => {
                    setSelectedFinding(finding.id)
                  }}
                >
                  {finding.title}
                </button>
              </li>
            ))}
          </ul>
        </section>
      )}
    </div>
  )
}
