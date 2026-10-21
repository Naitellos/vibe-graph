import { describe, expect, it } from 'vitest'
import { assertNodeVersion } from './node-guard.js'

describe('assertNodeVersion', () => {
  it('ok when current >= min', () => {
    expect(assertNodeVersion('22.12.0', '22.12.0').ok).toBe(true)
    expect(assertNodeVersion('22.14.1', '22.12.0').ok).toBe(true)
    expect(assertNodeVersion('24.0.0', '22.12.0').ok).toBe(true)
  })
  it('not ok when current < min', () => {
    const r = assertNodeVersion('20.11.0', '22.12.0')
    expect(r.ok).toBe(false)
    expect(r.message).toContain('22.12.0')
    expect(r.message).toContain('20.11.0')
  })
  it('not ok on lower minor of same major', () => {
    expect(assertNodeVersion('22.10.0', '22.12.0').ok).toBe(false)
  })
  it('tolerates leading v and prerelease suffix', () => {
    expect(assertNodeVersion('v22.12.0', '22.12.0').ok).toBe(true)
    expect(assertNodeVersion('22.12.0-nightly', '22.12.0').ok).toBe(true)
  })
})
