import { describe, expect, it } from 'vitest'
import { DEFAULT_DETECTOR_THRESHOLDS, DEFAULT_IGNORE_PATTERNS } from './defaults.js'

describe('defaults', () => {
  it('DEFAULT_IGNORE_PATTERNS covers node_modules, .git, dist, .env*', () => {
    expect(DEFAULT_IGNORE_PATTERNS).toContain('node_modules')
    expect(DEFAULT_IGNORE_PATTERNS).toContain('.git')
    expect(DEFAULT_IGNORE_PATTERNS).toContain('dist')
    expect(DEFAULT_IGNORE_PATTERNS).toContain('.env')
    expect(DEFAULT_IGNORE_PATTERNS).toContain('.env.*')
    expect(DEFAULT_IGNORE_PATTERNS).toContain('.vibegraph')
    expect(DEFAULT_IGNORE_PATTERNS).toContain('.superpowers')
  })

  it('DEFAULT_DETECTOR_THRESHOLDS has fan-out=6 fan-in=8', () => {
    expect(DEFAULT_DETECTOR_THRESHOLDS['core/fan-out']).toBe(6)
    expect(DEFAULT_DETECTOR_THRESHOLDS['core/fan-in']).toBe(8)
  })
})
