export interface Amount {
  currency: 'usd' | 'eur'
  cents: number
}

export type EventName = 'charge' | 'refund' | 'view'
