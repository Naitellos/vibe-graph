import { describe, expect, it } from 'vitest'
import { CORE_PACKAGE_NAME } from './index.js'

describe('@codearch/core smoke', () => {
  it('exports its package name as a const', () => {
    expect(CORE_PACKAGE_NAME).toBe('@codearch/core')
  })
})
