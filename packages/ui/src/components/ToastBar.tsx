import type React from 'react'
import { useEffect, useRef, useState } from 'react'
import { useDiffStore } from '../state/diff.js'
import { useWorkspaceStore } from '../state/workspace.js'
import type { WsBusClient } from '../state/ws-bus.js'
import { useWsBus } from '../state/ws-bus.js'

// ─── Types ────────────────────────────────────────────────────────────────────

interface Toast {
  id: string
  code: string
  message: string
  expiresAt: number
  /** Optional action button rendered inside the toast. */
  onClick?: () => void
  actionLabel?: string
}

export interface ToastBarProps {
  /** Inject a WsBusClient for tests. Defaults to useWsBus(). */
  bus?: WsBusClient
}

// ─── Auto-dismiss timeout in ms ───────────────────────────────────────────────

const DISMISS_DELAY_MS = 8000

// ─── Component ────────────────────────────────────────────────────────────────

function ToastBarInner({ bus }: { bus: WsBusClient }): React.JSX.Element {
  const [toasts, setToasts] = useState<Toast[]>([])

  // WS-bus handler: scan:error + validate:diff
  useEffect(() => {
    const unsubscribe = bus.subscribe((event) => {
      if (event.type !== 'scan:error' && event.type !== 'validate:diff') return

      const id = Date.now().toString() + Math.random().toString(36).slice(2)
      const expiresAt = Date.now() + DISMISS_DELAY_MS

      if (event.type === 'scan:error') {
        setToasts((prev) => [{ id, code: event.code, message: event.message, expiresAt }, ...prev])
      } else {
        // validate:diff — agent result toast with "View diff" action
        const toast: Toast = {
          id,
          code: 'AGENT',
          message: 'Agent validated · View diff',
          expiresAt,
          actionLabel: 'View diff',
          onClick: () => {
            useDiffStore.getState().activate()
            useWorkspaceStore.getState().setActiveWorkspace('map')
            setToasts((prev) => prev.filter((t) => t.id !== id))
          },
        }
        setToasts((prev) => [toast, ...prev])
      }

      setTimeout(() => {
        setToasts((prev) => prev.filter((t) => t.id !== id))
      }, DISMISS_DELAY_MS)
    })

    return unsubscribe
  }, [bus])

  // Store-watch handler: surface useDiffStore status:'error' as a toast.
  // We track the previous status via a ref so we only fire once per transition
  // to guarantee exactly one toast per error, not one per render.
  const prevDiffStatus = useRef<string>('idle')
  useEffect(() => {
    const unsubscribe = useDiffStore.subscribe((state) => {
      if (state.status === 'error' && prevDiffStatus.current !== 'error') {
        const id = Date.now().toString() + Math.random().toString(36).slice(2)
        const expiresAt = Date.now() + DISMISS_DELAY_MS
        setToasts((prev) => [
          { id, code: 'VALIDATE_ERROR', message: state.error ?? 'Validate failed', expiresAt },
          ...prev,
        ])
        setTimeout(() => {
          setToasts((prev) => prev.filter((t) => t.id !== id))
        }, DISMISS_DELAY_MS)
      }
      prevDiffStatus.current = state.status
    })
    return unsubscribe
  }, [])

  function dismiss(id: string): void {
    setToasts((prev) => prev.filter((t) => t.id !== id))
  }

  return (
    <div
      data-testid="toast-bar"
      style={{
        position: 'fixed',
        top: '16px',
        right: '16px',
        zIndex: 10000,
        display: 'flex',
        flexDirection: 'column',
        gap: '8px',
        maxWidth: '360px',
        pointerEvents: toasts.length === 0 ? 'none' : 'auto',
      }}
    >
      {toasts.map((toast) => (
        <div
          key={toast.id}
          data-testid="toast"
          data-toast-id={toast.id}
          role="alert"
          style={{
            background: 'var(--color-error-surface, #3b1c1c)',
            border: '1px solid var(--color-error-border, #7f2020)',
            borderRadius: '6px',
            padding: '10px 12px',
            color: 'var(--color-error-text, #ffb3b3)',
            display: 'flex',
            alignItems: 'flex-start',
            gap: '8px',
          }}
        >
          <div style={{ flex: 1, minWidth: 0 }}>
            <span
              style={{
                fontWeight: 600,
                fontSize: '12px',
                textTransform: 'uppercase',
                letterSpacing: '0.05em',
                display: 'block',
                marginBottom: '2px',
              }}
            >
              {toast.code}
            </span>
            <span style={{ fontSize: '13px', wordBreak: 'break-word' }}>{toast.message}</span>
            {toast.onClick !== undefined && (
              <button
                type="button"
                onClick={toast.onClick}
                style={{
                  marginTop: '6px',
                  background: 'transparent',
                  border: '1px solid currentColor',
                  borderRadius: '4px',
                  color: 'inherit',
                  cursor: 'pointer',
                  fontSize: '12px',
                  padding: '2px 8px',
                  display: 'block',
                }}
              >
                {toast.actionLabel ?? 'Action'}
              </button>
            )}
          </div>
          <button
            type="button"
            aria-label="Dismiss toast"
            onClick={() => dismiss(toast.id)}
            style={{
              background: 'transparent',
              border: 'none',
              color: 'inherit',
              cursor: 'pointer',
              fontSize: '16px',
              lineHeight: 1,
              padding: '0 0 0 4px',
              opacity: 0.7,
              flexShrink: 0,
            }}
          >
            ×
          </button>
        </div>
      ))}
    </div>
  )
}

/**
 * ToastBar — subscribes to the WS bus and renders error toasts.
 *
 * Toasts appear for `scan:error` events and auto-dismiss after 8 seconds.
 * Renders in a fixed top-right position with high z-index.
 *
 * @example
 * // In App root — uses the real WS bus:
 * <ToastBar />
 *
 * // In tests — inject a stub bus:
 * <ToastBar bus={stubBus} />
 */
export function ToastBar(props: ToastBarProps = {}): React.JSX.Element {
  // We call useWsBus() unconditionally so that the hook rules are always
  // satisfied, but we only use its result if no `bus` prop was provided.
  const hookBus = useWsBus()
  const bus = props.bus ?? hookBus

  return <ToastBarInner bus={bus} />
}
