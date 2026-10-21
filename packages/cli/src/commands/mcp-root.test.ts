import { describe, expect, it } from 'vitest'
import { pickExplicitRoot } from './mcp.js'

describe('pickExplicitRoot', () => {
  it('prefers the flag over the env', () => {
    expect(pickExplicitRoot('/flag', '/env')).toBe('/flag')
  })
  it('falls back to env when no flag', () => {
    expect(pickExplicitRoot(undefined, '/env')).toBe('/env')
  })
  it('returns undefined when neither set (or empty/whitespace)', () => {
    expect(pickExplicitRoot(undefined, undefined)).toBeUndefined()
    expect(pickExplicitRoot('', '  ')).toBeUndefined()
  })
})
