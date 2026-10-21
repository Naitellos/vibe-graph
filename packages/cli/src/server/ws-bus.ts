import type { ActivityEntry, ValidateDiffUiPayload } from '@codearch/core'

export type WsEvent =
  | { type: 'scan:start'; at: string }
  | { type: 'scan:progress'; stage: string; percent?: number }
  | { type: 'scan:complete'; builtAt: string; durationMs: number; scanId: string }
  | { type: 'scan:error'; code: string; message: string }
  | { type: 'graph:updated'; scanId: string }
  | { type: 'activity'; entry: ActivityEntry }
  | { type: 'validate:diff'; payload: ValidateDiffUiPayload }

export type WsEventType = WsEvent['type']

export type WsSubscriber = (event: WsEvent) => void

/**
 * In-process event bus for cockpit events. Subscribers receive every emit
 * synchronously (no buffering). New subscribers do NOT replay history — they
 * only see events emitted after they subscribe.
 */
export interface WsEventBus {
  subscribe(cb: WsSubscriber): () => void
  emit(event: WsEvent): void
  /** Number of active subscribers (used by tests and metrics). */
  subscriberCount(): number
}

export function createWsEventBus(): WsEventBus {
  const subscribers = new Set<WsSubscriber>()

  return {
    subscribe(cb: WsSubscriber): () => void {
      subscribers.add(cb)
      return () => {
        subscribers.delete(cb)
      }
    },
    emit(event: WsEvent): void {
      for (const cb of subscribers) {
        try {
          cb(event)
        } catch {
          // Swallow subscriber errors — bus contract is one bad subscriber
          // shouldn't break the others.
        }
      }
    },
    subscriberCount(): number {
      return subscribers.size
    },
  }
}
