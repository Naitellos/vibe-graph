import { describe, expect, it } from 'vitest'
import { SubsystemDocSchema } from './subsystem-doc.js'

describe('SubsystemDocSchema', () => {
  it('parses a minimal valid doc and applies defaults', () => {
    const parsed = SubsystemDocSchema.parse({
      id: 'payments',
      title: 'Payments',
      layer: 'domain',
      match: 'server/services/payment.ts',
    })
    expect(parsed.id).toBe('payments')
    expect(parsed.match).toEqual(['server/services/payment.ts'])
    expect(parsed.status).toBe('unknown')
    expect(parsed.description).toBe('')
    expect(parsed.depends_on).toEqual([])
  })

  it('parses a full-field doc', () => {
    const parsed = SubsystemDocSchema.parse({
      id: 'payments',
      title: 'Payments',
      layer: 'domain',
      status: 'shipped',
      description: 'Payments — единый ledger...',
      last_verified: '2026-05-26',
      verified_by: 'claude-sonnet-4-7',
      match: ['server/services/payment.ts', 'server/services/payments/**'],
      depends_on: ['frontend', 'admin'],
      consumed_by: ['dashboard', 'oracle'],
      schema_tables: ['payment_transactions', 'subscription_plans'],
      related_specs: ['docs/specs/2026-05-16.md'],
      related_decisions: ['docs/architecture/decisions/0007.md'],
      memory_refs: ['monetization-details'],
    })
    expect(parsed.depends_on).toEqual(['frontend', 'admin'])
    expect(parsed.schema_tables).toHaveLength(2)
  })

  it('rejects missing id', () => {
    expect(() =>
      SubsystemDocSchema.parse({ title: 'X', layer: 'domain', match: 'src/**' }),
    ).toThrow()
  })

  it('rejects malformed last_verified', () => {
    expect(() =>
      SubsystemDocSchema.parse({
        id: 'x',
        title: 'X',
        layer: 'domain',
        match: 'src/**',
        last_verified: 'not-a-date',
      }),
    ).toThrow(/last_verified/)
  })

  it('rejects unknown layer enum value', () => {
    expect(() =>
      SubsystemDocSchema.parse({ id: 'x', title: 'X', layer: 'invented', match: 'src/**' }),
    ).toThrow()
  })

  it('rejects unknown status enum value', () => {
    expect(() =>
      SubsystemDocSchema.parse({
        id: 'x',
        title: 'X',
        layer: 'domain',
        match: 'src/**',
        status: 'released',
      }),
    ).toThrow()
  })

  it('accepts match as a single string', () => {
    expect(
      SubsystemDocSchema.parse({ id: 'x', title: 'X', layer: 'domain', match: 'src/**' }).match,
    ).toEqual(['src/**'])
  })

  it('accepts match as an array', () => {
    expect(
      SubsystemDocSchema.parse({ id: 'x', title: 'X', layer: 'domain', match: ['a/**', 'b/**'] })
        .match,
    ).toEqual(['a/**', 'b/**'])
  })
})
