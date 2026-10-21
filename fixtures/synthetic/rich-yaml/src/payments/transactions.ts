import { verifyToken } from '../auth/jwt.js'
export function processPayment(token: string) {
  verifyToken(token)
  return { status: 'processed' }
}
