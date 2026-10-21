import { describe, expect, it } from 'vitest'
import { VIBEGRAPH_VERSION_FALLBACK, loadVibegraphVersion } from './version.js'

describe('loadVibegraphVersion', () => {
  it('returns a non-empty version string', async () => {
    const v = await loadVibegraphVersion()
    expect(typeof v).toBe('string')
    expect(v.length).toBeGreaterThan(0)
  })

  it('matches semver-ish shape OR is the unknown fallback', async () => {
    const v = await loadVibegraphVersion()
    // Either valid x.y.z(-pre) shape or the explicit unknown sentinel
    expect(v).toMatch(/^(\d+\.\d+\.\d+(-[\w.]+)?|unknown)$/)
  })
})

describe('VIBEGRAPH_VERSION_FALLBACK', () => {
  it('exposes a non-empty fallback', () => {
    expect(VIBEGRAPH_VERSION_FALLBACK.length).toBeGreaterThan(0)
  })
})
