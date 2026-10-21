import type React from 'react'
import { useEffect, useRef, useState } from 'react'
import { useLayoutStore } from '../state/layout.js'
import { useSelectionStore } from '../state/selection.js'
import { useSnapshot } from '../state/snapshot.js'
import { useThemeStore } from '../state/theme.js'

// ─── MCP config snippet (same as ProjectOverviewCard) ─────────────────────────

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

// ─── Types ────────────────────────────────────────────────────────────────────

interface PaletteResult {
  id: string
  label: string
  category: 'node' | 'file' | 'finding' | 'command'
  action: () => void | Promise<void>
}

// ─── Static commands ──────────────────────────────────────────────────────────

function buildCommands(): PaletteResult[] {
  return [
    {
      id: 'cmd:run-scan',
      label: 'Run scan',
      category: 'command',
      action: () => {
        void fetch('/api/scan', { method: 'POST' })
      },
    },
    {
      id: 'cmd:reset-layout',
      label: 'Reset layout',
      category: 'command',
      action: () => {
        useLayoutStore.getState().reset()
      },
    },
    {
      id: 'cmd:copy-mcp-config',
      label: 'Copy MCP config',
      category: 'command',
      action: () => {
        void navigator.clipboard.writeText(MCP_CONFIG_SNIPPET)
      },
    },
    {
      id: 'cmd:toggle-theme',
      label: 'Toggle theme',
      category: 'command',
      action: () => {
        useThemeStore.getState().toggleTheme()
      },
    },
  ]
}

// ─── Component ────────────────────────────────────────────────────────────────

export function CommandPalette(): React.JSX.Element | null {
  const paletteOpen = useLayoutStore((s) => s.paletteOpen)
  const setPaletteOpen = useLayoutStore((s) => s.setPaletteOpen)
  const { data: snapshot } = useSnapshot()
  const setSelectedNode = useSelectionStore((s) => s.setSelectedNode)
  const setSelectedFinding = useSelectionStore((s) => s.setSelectedFinding)

  const [query, setQuery] = useState('')
  const [highlightedIndex, setHighlightedIndex] = useState(0)

  const inputRef = useRef<HTMLInputElement>(null)
  const backdropRef = useRef<HTMLDivElement>(null)

  // Reset query and highlight when palette opens
  useEffect(() => {
    if (paletteOpen) {
      setQuery('')
      setHighlightedIndex(0)
      // Auto-focus input
      requestAnimationFrame(() => {
        inputRef.current?.focus()
      })
    }
  }, [paletteOpen])

  if (!paletteOpen) return null

  // ─── Build results ─────────────────────────────────────────────────────────

  const q = query.toLowerCase()

  const nodes = snapshot?.nodes ?? []
  const findings = snapshot?.findings ?? []

  // Node results (non-file nodes), top 10
  const nodeResults: PaletteResult[] = nodes
    .filter((n) => n.kind !== 'file' && n.id.toLowerCase().includes(q))
    .slice(0, 10)
    .map((n) => ({
      id: `node:${n.id}`,
      label: n.id,
      category: 'node' as const,
      action: () => {
        setSelectedNode(n.id)
        setPaletteOpen(false)
      },
    }))

  // File results (kind === 'file'), top 5
  const fileResults: PaletteResult[] = nodes
    .filter((n) => n.kind === 'file' && n.id.toLowerCase().includes(q))
    .slice(0, 5)
    .map((n) => ({
      id: `file:${n.id}`,
      label: n.id,
      category: 'file' as const,
      action: () => {
        setSelectedNode(n.id)
        setPaletteOpen(false)
      },
    }))

  // Finding results, top 10 — match title OR type
  const findingResults: PaletteResult[] = findings
    .filter((f) => f.title.toLowerCase().includes(q) || f.type.toLowerCase().includes(q))
    .slice(0, 10)
    .map((f) => ({
      id: `finding:${f.id}`,
      label: f.title,
      category: 'finding' as const,
      action: () => {
        setSelectedFinding(f.id)
        setPaletteOpen(false)
      },
    }))

  // Command results — filter by label
  const commandResults: PaletteResult[] = buildCommands()
    .filter((c) => c.label.toLowerCase().includes(q))
    .map((c) => ({
      ...c,
      action: () => {
        void c.action()
        setPaletteOpen(false)
      },
    }))

  const results: PaletteResult[] = [
    ...nodeResults,
    ...fileResults,
    ...findingResults,
    ...commandResults,
  ]

  // Clamp highlight within results
  const clampedIndex = results.length > 0 ? Math.min(highlightedIndex, results.length - 1) : 0

  // ─── Event handlers ────────────────────────────────────────────────────────

  function handleKeyDown(e: React.KeyboardEvent<HTMLInputElement>): void {
    if (e.key === 'Escape') {
      setPaletteOpen(false)
    } else if (e.key === 'ArrowDown') {
      e.preventDefault()
      setHighlightedIndex((i) => Math.min(i + 1, results.length - 1))
    } else if (e.key === 'ArrowUp') {
      e.preventDefault()
      setHighlightedIndex((i) => Math.max(i - 1, 0))
    } else if (e.key === 'Enter') {
      e.preventDefault()
      const result = results[clampedIndex]
      if (result) {
        void result.action()
      }
    }
  }

  function handleBackdropClick(e: React.MouseEvent<HTMLDivElement>): void {
    if (e.target === backdropRef.current) {
      setPaletteOpen(false)
    }
  }

  function handleBackdropKeyDown(e: React.KeyboardEvent<HTMLDivElement>): void {
    if (e.key === 'Escape') {
      setPaletteOpen(false)
    }
  }

  function handleQueryChange(e: React.ChangeEvent<HTMLInputElement>): void {
    setQuery(e.target.value)
    setHighlightedIndex(0)
  }

  // ─── Render ────────────────────────────────────────────────────────────────

  return (
    <div
      ref={backdropRef}
      data-testid="command-palette-backdrop"
      onClick={handleBackdropClick}
      onKeyDown={handleBackdropKeyDown}
      style={{
        position: 'fixed',
        inset: 0,
        zIndex: 9999,
        background: 'rgba(0,0,0,0.5)',
        display: 'flex',
        alignItems: 'flex-start',
        justifyContent: 'center',
        paddingTop: '15vh',
      }}
    >
      <dialog
        open
        data-testid="command-palette"
        aria-label="Command Palette"
        style={{
          background: 'var(--color-surface, #1e1e2e)',
          border: '1px solid var(--color-border, #444)',
          borderRadius: '8px',
          width: '560px',
          maxWidth: '90vw',
          maxHeight: '60vh',
          display: 'flex',
          flexDirection: 'column',
          overflow: 'hidden',
          position: 'relative',
          padding: 0,
          margin: 0,
        }}
      >
        <input
          ref={inputRef}
          role="searchbox"
          aria-label="Search commands, nodes, files, findings"
          placeholder="Search commands, nodes, files, findings…"
          value={query}
          onChange={handleQueryChange}
          onKeyDown={handleKeyDown}
          style={{
            padding: '12px 16px',
            fontSize: '16px',
            border: 'none',
            borderBottom: '1px solid var(--color-border, #444)',
            background: 'transparent',
            color: 'inherit',
            outline: 'none',
          }}
        />
        <ul
          aria-label="Results"
          style={{
            margin: 0,
            padding: 0,
            listStyle: 'none',
            overflowY: 'auto',
          }}
        >
          {results.map((result, index) => (
            <li
              key={result.id}
              style={{
                padding: 0,
                margin: 0,
              }}
            >
              <button
                type="button"
                data-highlighted={index === clampedIndex ? 'true' : undefined}
                aria-current={index === clampedIndex ? 'true' : undefined}
                onClick={() => {
                  void result.action()
                }}
                style={{
                  width: '100%',
                  padding: '10px 16px',
                  cursor: 'pointer',
                  background:
                    index === clampedIndex ? 'var(--color-accent-subtle, #2a2a3e)' : 'transparent',
                  border: 'none',
                  color: 'inherit',
                  display: 'flex',
                  justifyContent: 'space-between',
                  alignItems: 'center',
                  textAlign: 'left',
                }}
              >
                <span>{result.label}</span>
                <span
                  style={{
                    fontSize: '11px',
                    opacity: 0.5,
                    textTransform: 'uppercase',
                    letterSpacing: '0.05em',
                  }}
                >
                  {result.category}
                </span>
              </button>
            </li>
          ))}
          {results.length === 0 && query.length > 0 && (
            <li
              style={{
                padding: '10px 16px',
                opacity: 0.5,
                fontStyle: 'italic',
              }}
            >
              No results for &ldquo;{query}&rdquo;
            </li>
          )}
        </ul>
      </dialog>
    </div>
  )
}
