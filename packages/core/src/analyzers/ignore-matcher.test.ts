import { describe, expect, it } from 'vitest'
import { createIgnoreMatcher } from './ignore-matcher.js'

describe('createIgnoreMatcher', () => {
  it('matches defaults', () => {
    const m = createIgnoreMatcher({ patterns: [], includeDefaults: true })
    expect(m.ignores('node_modules/x.ts')).toBe(true)
    expect(m.ignores('.env')).toBe(true)
    expect(m.ignores('src/foo.ts')).toBe(false)
  })

  it('user patterns extend defaults', () => {
    const m = createIgnoreMatcher({
      patterns: ['src/vendor/**'],
      includeDefaults: true,
    })
    expect(m.ignores('src/vendor/jquery.js')).toBe(true)
    expect(m.ignores('src/app.ts')).toBe(false)
  })

  it('supports negation: `!important.ts` un-ignores within ignored dir', () => {
    const m = createIgnoreMatcher({
      patterns: ['logs/**', '!logs/important.log'],
      includeDefaults: false,
    })
    expect(m.ignores('logs/random.log')).toBe(true)
    expect(m.ignores('logs/important.log')).toBe(false)
  })

  it('returns the merged pattern list for the coarse glob seed', () => {
    const m = createIgnoreMatcher({
      patterns: ['custom/**'],
      includeDefaults: true,
    })
    expect(m.patterns).toContain('node_modules')
    expect(m.patterns).toContain('custom/**')
  })
})
