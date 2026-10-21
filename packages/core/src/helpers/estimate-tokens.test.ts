import { describe, expect, it } from 'vitest'
import { estimateTokens } from './estimate-tokens.js'

describe('estimateTokens', () => {
  it('Test 1: single string returns round(charCount/4)', () => {
    // 'hello world' = 11 chars → round(11/4) = round(2.75) = 3
    expect(estimateTokens({ summary: 'hello world' })).toBe(3)
  })

  it('Test 2: multi-field sums chars before dividing', () => {
    // 'abc'=3 + 'defgh'=5 = 8 → round(8/4) = 2
    expect(estimateTokens({ summary: 'abc', detail: 'defgh' })).toBe(2)
  })

  it('Test 3: string array sums element lengths (no newline counting)', () => {
    // ['ab','cd','ef'] = 2+2+2 = 6 → round(6/4) = round(1.5) = 2
    expect(estimateTokens({ lines: ['ab', 'cd', 'ef'] })).toBe(2)
  })

  it('Test 4: empty input returns 0', () => {
    expect(estimateTokens({})).toBe(0)
  })

  it('Test 5: known longer string within ±2 of expected', () => {
    // 'The quick brown fox jumps over the lazy dog' = 43 chars → round(43/4) = round(10.75) = 11
    const result = estimateTokens({ s: 'The quick brown fox jumps over the lazy dog' })
    expect(result).toBe(11)
    expect(result).toBeGreaterThanOrEqual(9)
    expect(result).toBeLessThanOrEqual(13)
  })

  it('Test 6: mixed string + array', () => {
    // 'xy'=2 + ['12','34']=2+2=4 → total=6 → round(6/4) = round(1.5) = 2
    expect(estimateTokens({ a: 'xy', b: ['12', '34'] })).toBe(2)
  })
})
