import { cents } from '../core/money.js'

export function report(dollars: number[]): number {
  return dollars.reduce((sum, d) => sum + cents(d), 0)
}
