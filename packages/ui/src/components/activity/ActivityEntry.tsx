import type { ActivityEntry as ActivityEntryType } from '@codearch/core'
import type React from 'react'
import { useState } from 'react'

// ─── Helpers ──────────────────────────────────────────────────────────────────

function formatTimeAgo(ts: number): string {
  const diffMs = Date.now() - ts
  const diffSec = Math.floor(diffMs / 1000)

  if (diffSec < 10) return 'just now'
  if (diffSec < 60) return `${diffSec}s ago`

  const diffMin = Math.floor(diffSec / 60)
  if (diffMin < 60) return `${diffMin}m ago`

  const diffHr = Math.floor(diffMin / 60)
  if (diffHr < 24) return `${diffHr}h ago`

  return new Date(ts).toLocaleDateString()
}

function prettyJson(s: string | undefined): string {
  if (s === undefined) return ''
  try {
    return JSON.stringify(JSON.parse(s), null, 2)
  } catch {
    return s
  }
}

// ─── Props ────────────────────────────────────────────────────────────────────

export interface ActivityEntryProps {
  entry: ActivityEntryType
}

// ─── Component ────────────────────────────────────────────────────────────────

export function ActivityEntry({ entry }: ActivityEntryProps): React.JSX.Element {
  const [expanded, setExpanded] = useState(false)

  const {
    tool,
    ts,
    durationMs,
    status,
    summary,
    argsRedacted,
    resultRedacted,
    errorMessage,
    redactions,
    truncated,
  } = entry

  const statusIcon = status === 'ok' ? '✓' : '✗'
  const statusColor =
    status === 'ok' ? 'var(--color-success, #4caf50)' : 'var(--color-error, #f44336)'

  return (
    <div
      data-testid={`activity-entry-${entry.id}`}
      style={{
        borderBottom: '1px solid var(--color-border, #2a2a2a)',
      }}
    >
      {/* Row button */}
      <button
        type="button"
        aria-label={`Expand ${tool}`}
        aria-expanded={expanded}
        onClick={() => setExpanded((prev) => !prev)}
        style={{
          width: '100%',
          background: 'transparent',
          border: 'none',
          cursor: 'pointer',
          textAlign: 'left',
          padding: '6px 8px',
          display: 'grid',
          gridTemplateColumns: 'max-content max-content 1fr max-content max-content',
          gap: '8px',
          alignItems: 'center',
          color: 'var(--color-text, #e0e0e0)',
          fontSize: '12px',
        }}
      >
        {/* Time ago */}
        <span
          style={{
            color: 'var(--color-text-muted, #888)',
            fontSize: '11px',
            whiteSpace: 'nowrap',
          }}
        >
          {formatTimeAgo(ts)}
        </span>

        {/* Tool chip */}
        <span
          style={{
            background: 'var(--color-chip-bg, #1e3a5f)',
            color: 'var(--color-chip-text, #90caf9)',
            borderRadius: '3px',
            padding: '1px 5px',
            fontSize: '11px',
            fontFamily: 'monospace',
            whiteSpace: 'nowrap',
          }}
        >
          {tool}
        </span>

        {/* Summary */}
        <span
          style={{
            overflow: 'hidden',
            textOverflow: 'ellipsis',
            whiteSpace: 'nowrap',
            color: 'var(--color-text, #e0e0e0)',
          }}
        >
          {summary ?? ''}
        </span>

        {/* Duration */}
        <span
          style={{
            color: 'var(--color-text-muted, #888)',
            whiteSpace: 'nowrap',
            fontSize: '11px',
          }}
        >
          {durationMs} ms
        </span>

        {/* Status icon */}
        <span
          style={{
            color: statusColor,
            fontWeight: 700,
            fontSize: '13px',
          }}
        >
          {statusIcon}
        </span>
      </button>

      {/* Expanded panel */}
      {expanded && (
        <div
          style={{
            padding: '4px 8px 8px 8px',
            display: 'flex',
            flexDirection: 'column',
            gap: '4px',
          }}
        >
          {/* Args */}
          <pre
            style={{
              margin: 0,
              background: 'var(--color-code-bg, #111)',
              border: '1px solid var(--color-border, #2a2a2a)',
              borderRadius: '4px',
              padding: '6px 8px',
              fontSize: '11px',
              fontFamily: 'monospace',
              overflowX: 'auto',
              color: 'var(--color-text, #e0e0e0)',
            }}
          >
            {prettyJson(argsRedacted)}
          </pre>

          {/* Result or error */}
          {status === 'error' ? (
            <pre
              style={{
                margin: 0,
                background: 'var(--color-error-surface, #3b1c1c)',
                border: '1px solid var(--color-error-border, #7f2020)',
                borderRadius: '4px',
                padding: '6px 8px',
                fontSize: '11px',
                fontFamily: 'monospace',
                overflowX: 'auto',
                color: 'var(--color-error-text, #ffb3b3)',
              }}
            >
              {errorMessage ?? ''}
            </pre>
          ) : resultRedacted !== undefined ? (
            <pre
              style={{
                margin: 0,
                background: 'var(--color-code-bg, #111)',
                border: '1px solid var(--color-border, #2a2a2a)',
                borderRadius: '4px',
                padding: '6px 8px',
                fontSize: '11px',
                fontFamily: 'monospace',
                overflowX: 'auto',
                color: 'var(--color-text, #e0e0e0)',
              }}
            >
              {prettyJson(resultRedacted)}
            </pre>
          ) : null}

          {/* Footer */}
          <div
            style={{
              fontSize: '10px',
              color: 'var(--color-text-muted, #888)',
              fontFamily: 'monospace',
            }}
          >
            redactions: {redactions} · truncated: {truncated ? 'yes' : 'no'}
          </div>
        </div>
      )}
    </div>
  )
}
