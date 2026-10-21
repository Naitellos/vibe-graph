import { describe, expect, it } from 'vitest'
import { computeFitTransform } from './fit-transform.js'

describe('computeFitTransform', () => {
  it('fits wide-short content to width and centers vertically', () => {
    // content 600x200 into 800x800 viewport, padding 40 → avail 720x720.
    // scale = min(720/600, 720/200) = min(1.2, 3.6) = 1.2
    const t = computeFitTransform({
      contentWidth: 600,
      contentHeight: 200,
      viewWidth: 800,
      viewHeight: 800,
      padding: 40,
    })
    expect(t.k).toBeCloseTo(1.2, 5)
    // tx = (800 - 600*1.2)/2 = (800-720)/2 = 40
    expect(t.x).toBeCloseTo(40, 5)
    // ty = (800 - 200*1.2)/2 = (800-240)/2 = 280
    expect(t.y).toBeCloseTo(280, 5)
  })

  it('fits tall-narrow content to height and centers horizontally', () => {
    // content 200x600 into 800x800, padding 40 → avail 720x720.
    // scale = min(720/200, 720/600) = min(3.6, 1.2) = 1.2
    const t = computeFitTransform({
      contentWidth: 200,
      contentHeight: 600,
      viewWidth: 800,
      viewHeight: 800,
      padding: 40,
    })
    expect(t.k).toBeCloseTo(1.2, 5)
    expect(t.x).toBeCloseTo(280, 5)
    expect(t.y).toBeCloseTo(40, 5)
  })

  it('clamps scale to the max of the scaleExtent', () => {
    // tiny content would scale huge; clamp to max 4.
    const t = computeFitTransform({
      contentWidth: 10,
      contentHeight: 10,
      viewWidth: 800,
      viewHeight: 800,
      padding: 40,
      scaleExtent: [0.2, 4],
    })
    expect(t.k).toBe(4)
  })

  it('clamps scale to the min of the scaleExtent', () => {
    // huge content would scale tiny; clamp to min 0.2.
    const t = computeFitTransform({
      contentWidth: 100000,
      contentHeight: 100000,
      viewWidth: 800,
      viewHeight: 800,
      padding: 40,
      scaleExtent: [0.2, 4],
    })
    expect(t.k).toBe(0.2)
  })

  it('returns the identity transform for degenerate (zero) dimensions', () => {
    const t = computeFitTransform({
      contentWidth: 0,
      contentHeight: 0,
      viewWidth: 800,
      viewHeight: 800,
    })
    expect(t.k).toBe(1)
    expect(t.x).toBe(0)
    expect(t.y).toBe(0)
  })

  it('returns the identity transform when the viewport is not yet measured', () => {
    const t = computeFitTransform({
      contentWidth: 600,
      contentHeight: 200,
      viewWidth: 0,
      viewHeight: 0,
    })
    expect(t.k).toBe(1)
    expect(t.x).toBe(0)
    expect(t.y).toBe(0)
  })
})
