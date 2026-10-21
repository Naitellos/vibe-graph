import { cents } from '../core/money.js'

export function charge(amount: number): number {
  return cents(amount)
}
