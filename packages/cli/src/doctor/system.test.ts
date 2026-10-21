import { describe, expect, it } from 'vitest'
import { SYSTEM_CHECKS, gitCheck, nodeVersionCheck, pnpmCheck, which } from './system.js'

const ctx = { projectRoot: '/tmp/vg-test' }

describe('nodeVersionCheck', () => {
  it('returns ok on the test runner (Node >=22.12)', async () => {
    const r = await nodeVersionCheck.run(ctx)
    expect(r.id).toBe('system/node-version')
    expect(r.status).toBe('ok')
    expect(r.message).toContain('Node.js')
  })
})

describe('pnpmCheck', () => {
  it('returns ok or warn depending on PATH; never throws', async () => {
    const r = await pnpmCheck.run(ctx)
    expect(r.id).toBe('system/pnpm')
    expect(['ok', 'warn']).toContain(r.status)
  })
})

describe('gitCheck', () => {
  it('returns ok or warn depending on PATH; never throws', async () => {
    const r = await gitCheck.run(ctx)
    expect(r.id).toBe('system/git')
    expect(['ok', 'warn']).toContain(r.status)
  })
})

describe('which', () => {
  it('returns a non-empty path for a known binary (node)', () => {
    const path = which('node')
    expect(path).not.toBeNull()
    expect(path?.length).toBeGreaterThan(0)
  })

  it('returns null for a non-existent binary', () => {
    const path = which('__nonexistent_binary_xyz__')
    expect(path).toBeNull()
  })
})

describe('SYSTEM_CHECKS registry', () => {
  it('exports 3 checks: node-version, pnpm, git', () => {
    expect(SYSTEM_CHECKS).toHaveLength(3)
    const ids = SYSTEM_CHECKS.map((c) => c.id)
    expect(ids).toEqual(['system/node-version', 'system/pnpm', 'system/git'])
  })
})
