import type React from 'react'
import { useState } from 'react'
import { useSelectionStore } from '../state/selection.js'
import { useContextPack } from '../state/snapshot.js'

type Budget = 4000 | 8000 | 12000 | 16000

const BUDGET_OPTIONS: { value: Budget; label: string }[] = [
  { value: 4000, label: '4k' },
  { value: 8000, label: '8k' },
  { value: 12000, label: '12k' },
  { value: 16000, label: '16k' },
]

export function ContextPackView(): React.JSX.Element {
  const selectedNodeId = useSelectionStore((s) => s.selectedNodeId)

  const [budget, setBudget] = useState<Budget>(8000)
  const [requestedTarget, setRequestedTarget] = useState<string | null>(null)
  const [copied, setCopied] = useState(false)

  const { data, isLoading } = useContextPack(
    requestedTarget,
    requestedTarget !== null ? { maxTokens: budget } : undefined,
  )

  function handleGenerate(): void {
    if (selectedNodeId === null) return
    // Force a new SWR key by resetting first when target/budget changes
    setRequestedTarget(selectedNodeId)
  }

  function handleCopyJson(): void {
    if (data === undefined) return
    const json = JSON.stringify(data, null, 2)
    navigator.clipboard
      .writeText(json)
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
    <div data-testid="context-pack-view">
      {/* Budget selector */}
      <fieldset>
        <legend>Budget</legend>
        {BUDGET_OPTIONS.map(({ value, label }) => (
          <label key={value}>
            <input
              type="radio"
              name="budget"
              value={String(value)}
              checked={budget === value}
              onChange={() => {
                setBudget(value)
              }}
            />
            {label}
          </label>
        ))}
      </fieldset>

      {/* No-selection hint */}
      {selectedNodeId === null && <p>Select a node to generate a context pack.</p>}

      {/* Generate button */}
      <button type="button" onClick={handleGenerate} disabled={selectedNodeId === null}>
        Generate context pack
      </button>

      {/* Loading state */}
      {isLoading && <p>Generating…</p>}

      {/* Preview area */}
      {data !== undefined && (
        <>
          <pre data-testid="context-pack-preview">{JSON.stringify(data, null, 2)}</pre>

          {/* Copy JSON button */}
          <button type="button" onClick={handleCopyJson}>
            {copied ? 'Copied!' : 'Copy JSON'}
          </button>
        </>
      )}
    </div>
  )
}
