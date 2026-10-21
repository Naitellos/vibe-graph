import { describe, expect, it } from 'vitest'
import { edgeMidpoint } from './edge-midpoint.js'

describe('edgeMidpoint', () => {
  it('returns { x: 0, y: 0 } for an empty array', () => {
    expect(edgeMidpoint([])).toEqual({ x: 0, y: 0 })
  })

  it('picks the middle point for an odd-length array', () => {
    const points = [
      { x: 0, y: 0 },
      { x: 10, y: 10 },
      { x: 20, y: 20 },
    ]
    // midIndex = floor(3/2) = 1
    expect(edgeMidpoint(points)).toEqual({ x: 10, y: 10 })
  })

  it('picks the right-of-center element for an even-length array', () => {
    const points = [
      { x: 0, y: 0 },
      { x: 10, y: 10 },
      { x: 20, y: 20 },
      { x: 30, y: 30 },
    ]
    // midIndex = floor(4/2) = 2
    expect(edgeMidpoint(points)).toEqual({ x: 20, y: 20 })
  })

  it('returns the only point for a single-element array', () => {
    expect(edgeMidpoint([{ x: 5, y: 7 }])).toEqual({ x: 5, y: 7 })
  })

  it('returns the second point for a two-element array', () => {
    const points = [
      { x: 100, y: 100 },
      { x: 300, y: 100 },
    ]
    // midIndex = floor(2/2) = 1
    expect(edgeMidpoint(points)).toEqual({ x: 300, y: 100 })
  })
})
