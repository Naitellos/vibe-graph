import { describe, expect, it } from 'vitest'
import { runChecks } from './registry.js'
import type { Check } from './types.js'

const ctx = { projectRoot: '/tmp/x' }

describe('runChecks', () => {
  it('runs checks sequentially and returns results in order', async () => {
    const order: string[] = []
    const checks: Check[] = [
      {
        id: 'a',
        description: 'check a',
        async run() {
          order.push('a')
          return { id: 'a', status: 'ok', message: 'a ok' }
        },
      },
      {
        id: 'b',
        description: 'check b',
        async run() {
          order.push('b')
          return { id: 'b', status: 'warn', message: 'b warn' }
        },
      },
    ]
    const results = await runChecks({ checks, ctx })
    expect(order).toEqual(['a', 'b'])
    expect(results).toHaveLength(2)
    expect(results[0]?.id).toBe('a')
    expect(results[1]?.status).toBe('warn')
  })

  it('captures thrown errors as error-status results', async () => {
    const checks: Check[] = [
      {
        id: 'boom',
        description: 'always throws',
        async run() {
          throw new Error('explosion')
        },
      },
    ]
    const results = await runChecks({ checks, ctx })
    expect(results).toHaveLength(1)
    expect(results[0]?.status).toBe('error')
    expect(results[0]?.message).toContain('explosion')
  })

  it('returns empty array for empty checks list', async () => {
    const results = await runChecks({ checks: [], ctx })
    expect(results).toEqual([])
  })
})
