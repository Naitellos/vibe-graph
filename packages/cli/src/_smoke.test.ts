import { describe, expect, it } from 'vitest'
import { VIBEGRAPH_VERSION_FALLBACK, loadVibegraphVersion } from './version.js'

describe('vibe-graph CLI smoke', () => {
  it('exports a non-empty fallback version string', () => {
    expect(VIBEGRAPH_VERSION_FALLBACK).toBeTypeOf('string')
    expect(VIBEGRAPH_VERSION_FALLBACK.length).toBeGreaterThan(0)
  })

  it('loadVibegraphVersion returns a non-empty string', async () => {
    const v = await loadVibegraphVersion()
    expect(v).toBeTypeOf('string')
    expect(v.length).toBeGreaterThan(0)
  })
})
