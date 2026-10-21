import { usd } from '../core/money.js'
import type { Amount } from '../core/types.js'

export function invoice(dollars: number): Amount {
  return usd(dollars)
}
