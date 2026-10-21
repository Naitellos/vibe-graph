import type { Amount } from './types.js'

export function cents(dollars: number): number {
  return Math.round(dollars * 100)
}

export function usd(dollars: number): Amount {
  return { currency: 'usd', cents: cents(dollars) }
}
