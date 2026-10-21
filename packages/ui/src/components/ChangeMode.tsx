import type React from 'react'
import { useChangeModeStore } from '../state/change-mode.js'
import { ChangeExitBar } from './change/ChangeExitBar.js'
import { ChangeForm } from './change/ChangeForm.js'
import { PreparedTaskView } from './change/PreparedTaskView.js'

export function ChangeMode(): React.JSX.Element {
  const status = useChangeModeStore((s) => s.status)
  const error = useChangeModeStore((s) => s.error)
  const preparedTask = useChangeModeStore((s) => s.preparedTask)
  const lastSubmittedInput = useChangeModeStore((s) => s.lastSubmittedInput)

  return (
    <div
      data-testid="change-mode-root"
      style={{ display: 'flex', flexDirection: 'column', height: '100%', overflow: 'auto' }}
    >
      <ChangeForm />
      {status === 'error' && error !== null ? (
        <div
          role="alert"
          style={{
            margin: '0 12px 12px',
            padding: 8,
            border: '1px solid var(--color-error-border, #7f2020)',
            borderRadius: 4,
            background: 'var(--color-error-surface, #3b1c1c)',
            color: 'var(--color-error-text, #ffb3b3)',
            fontSize: 13,
          }}
        >
          {error}
        </div>
      ) : null}
      {status === 'loading' ? (
        <p style={{ padding: '0 12px', margin: 0, fontSize: 13, opacity: 0.7 }}>Preparing…</p>
      ) : null}
      {preparedTask !== null && lastSubmittedInput !== null ? (
        <>
          <PreparedTaskView input={lastSubmittedInput} output={preparedTask} />
          <ChangeExitBar input={lastSubmittedInput} output={preparedTask} />
        </>
      ) : null}
    </div>
  )
}
