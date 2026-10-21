import type { EventName } from '../core/types.js'

const events: { name: EventName; value: number }[] = []

export function track(name: EventName, value: number): void {
  events.push({ name, value })
}
