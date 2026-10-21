import { verifyToken } from '../auth/jwt.js'
import { processPayment } from '../payments/transactions.js'
export function render(token: string) {
  verifyToken(token)
  processPayment(token)
  return null
}
