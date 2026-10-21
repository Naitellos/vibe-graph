import type React from 'react'
import { useMemo, useState } from 'react'
import { type ChangeModeMode, useChangeModeStore } from '../../state/change-mode.js'
import { useSnapshot } from '../../state/snapshot.js'

const MAX_SUGGESTIONS = 20

export function ChangeForm(): React.JSX.Element {
  const intent = useChangeModeStore((s) => s.intent)
  const paths = useChangeModeStore((s) => s.paths)
  const mode = useChangeModeStore((s) => s.mode)
  const status = useChangeModeStore((s) => s.status)
  const { data: snapshot } = useSnapshot()
  const [pathInput, setPathInput] = useState('')

  const allFilePaths = useMemo<string[]>(() => {
    if (snapshot === undefined) return []
    return snapshot.nodes.filter((n) => n.kind === 'file').map((n) => n.id.replace(/^file:/, ''))
  }, [snapshot])

  const suggestions = useMemo<string[]>(() => {
    const q = pathInput.trim().toLowerCase()
    if (q.length === 0) return []
    const seen = new Set(paths)
    const out: string[] = []
    for (const p of allFilePaths) {
      if (!p.toLowerCase().includes(q)) continue
      if (seen.has(p)) continue
      out.push(p)
      if (out.length >= MAX_SUGGESTIONS) break
    }
    return out
  }, [allFilePaths, pathInput, paths])

  function addPath(p: string): void {
    if (paths.includes(p)) return
    useChangeModeStore.getState().setPaths([...paths, p])
    setPathInput('')
  }
  function removePath(p: string): void {
    useChangeModeStore.getState().setPaths(paths.filter((x) => x !== p))
  }
  function onPathInputKeyDown(e: React.KeyboardEvent<HTMLInputElement>): void {
    if (e.key === 'Enter' && suggestions.length > 0) {
      e.preventDefault()
      // biome-ignore lint/style/noNonNullAssertion: length > 0 guarantees index 0 exists
      addPath(suggestions[0]!)
    }
    if (e.key === 'Backspace' && pathInput === '' && paths.length > 0)
      // biome-ignore lint/style/noNonNullAssertion: length > 0 guarantees last index exists
      removePath(paths[paths.length - 1]!)
  }

  const disabled = intent.trim() === '' || paths.length === 0 || status === 'loading'

  return (
    <form
      onSubmit={(e) => {
        e.preventDefault()
        if (!disabled) void useChangeModeStore.getState().submit()
      }}
      style={{ display: 'flex', flexDirection: 'column', gap: 8, padding: 12 }}
    >
      <textarea
        placeholder="Intent — describe what you're changing"
        value={intent}
        onChange={(e) => useChangeModeStore.getState().setIntent(e.target.value)}
        rows={3}
        style={{ width: '100%' }}
      />
      <div data-testid="paths-chips" style={{ display: 'flex', flexWrap: 'wrap', gap: 4 }}>
        {paths.map((p) => (
          <span
            key={p}
            style={{
              display: 'inline-flex',
              alignItems: 'center',
              padding: '2px 6px',
              borderRadius: 4,
              background: 'var(--surface-raised, #1e1c33)',
              fontSize: 12,
            }}
          >
            {p}
            <button
              type="button"
              aria-label={`Remove ${p}`}
              onClick={() => removePath(p)}
              style={{
                marginLeft: 4,
                background: 'transparent',
                border: 'none',
                color: 'inherit',
                cursor: 'pointer',
              }}
            >
              ×
            </button>
          </span>
        ))}
      </div>
      <div style={{ position: 'relative' }}>
        <input
          type="text"
          placeholder="Add path…"
          value={pathInput}
          onChange={(e) => setPathInput(e.target.value)}
          onKeyDown={onPathInputKeyDown}
          style={{ width: '100%' }}
        />
        {suggestions.length > 0 ? (
          <ul
            data-testid="path-suggestions"
            style={{
              position: 'absolute',
              top: '100%',
              left: 0,
              right: 0,
              listStyle: 'none',
              padding: 0,
              margin: 0,
              border: '1px solid var(--border, #2c2a44)',
              background: 'var(--surface, #17152a)',
              maxHeight: 240,
              overflowY: 'auto',
              zIndex: 10,
            }}
          >
            {suggestions.map((s) => (
              <li key={s}>
                <button
                  type="button"
                  onClick={() => addPath(s)}
                  style={{
                    width: '100%',
                    textAlign: 'left',
                    background: 'transparent',
                    border: 'none',
                    color: 'inherit',
                    padding: 6,
                    cursor: 'pointer',
                  }}
                >
                  {s}
                </button>
              </li>
            ))}
          </ul>
        ) : null}
      </div>
      <div style={{ display: 'flex', gap: 8, alignItems: 'center' }}>
        <label>
          Mode:&nbsp;
          <select
            value={mode}
            onChange={(e) =>
              useChangeModeStore.getState().setMode(e.target.value as ChangeModeMode)
            }
          >
            <option value="refactor">refactor</option>
            <option value="feature">feature</option>
            <option value="bugfix">bugfix</option>
          </select>
        </label>
        <button type="submit" className="vg-button" disabled={disabled}>
          {status === 'loading' ? 'Preparing…' : 'Submit'}
        </button>
      </div>
    </form>
  )
}
