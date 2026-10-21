import { describe, expect, it } from 'vitest'
import type { SubsystemDoc } from '../schema/subsystem-doc.js'
import { coreTablesAnalyzer } from './core-tables.js'
import type { AnalyzerContext } from './types.js'

function makeCtx(docs: SubsystemDoc[]): AnalyzerContext {
  return {
    projectRoot: '/tmp/p',
    programs: {} as never,
    files: [],
    ignore: { ignores: () => false } as never,
    log: { info: () => {}, warn: () => {}, error: () => {}, debug: () => {} } as never,
    config: {
      project: { root: '.' },
      subsystemDetection: { mode: 'auto' },
      subsystems: [],
      detectors: {},
    },
    subsystemDocs: docs,
  }
}

const baseDoc: SubsystemDoc = {
  id: 'x',
  title: 'X',
  layer: 'domain' as const,
  status: 'shipped' as const,
  description: '',
  match: ['src/**'],
  depends_on: [],
  consumed_by: [],
  schema_tables: [],
  related_specs: [],
  related_decisions: [],
  memory_refs: [],
}

describe('coreTablesAnalyzer', () => {
  it('emits empty result when no docs', async () => {
    const r = await coreTablesAnalyzer.run(makeCtx([]))
    expect(r.nodes).toEqual([])
    expect(r.edges).toEqual([])
    expect(r.evidence).toEqual([])
  })

  it('emits one Node + one Edge for a single table', async () => {
    const r = await coreTablesAnalyzer.run(
      makeCtx([{ ...baseDoc, id: 'payments', schema_tables: ['payment_transactions'] }]),
    )
    expect(r.nodes).toHaveLength(1)
    expect(r.edges).toHaveLength(1)
    expect(r.nodes[0]?.id).toBe('table:payment_transactions')
    expect(r.nodes[0]?.kind).toBe('table')
    expect(r.edges[0]?.from).toBe('subsystem:payments')
    expect(r.edges[0]?.to).toBe('table:payment_transactions')
  })

  it("owns edge has kind='owns', source='yaml' with correct from/to", async () => {
    const r = await coreTablesAnalyzer.run(
      makeCtx([{ ...baseDoc, id: 'auth', schema_tables: ['users'] }]),
    )
    expect(r.edges).toHaveLength(1)
    const edge = r.edges[0]
    expect(edge?.kind).toBe('owns')
    expect(edge?.source).toBe('yaml')
    expect(edge?.from).toBe('subsystem:auth')
    expect(edge?.to).toBe('table:users')
    expect(edge?.confidence).toBe('high')
  })

  it('shared table name across two docs emits 2 nodes + 2 edges', async () => {
    const r = await coreTablesAnalyzer.run(
      makeCtx([
        { ...baseDoc, id: 'service_a', schema_tables: ['shared_data'] },
        { ...baseDoc, id: 'service_b', schema_tables: ['shared_data'] },
      ]),
    )
    expect(r.nodes).toHaveLength(2)
    expect(r.edges).toHaveLength(2)
    expect(r.edges[0]?.from).toBe('subsystem:service_a')
    expect(r.edges[0]?.to).toBe('table:shared_data')
    expect(r.edges[1]?.from).toBe('subsystem:service_b')
    expect(r.edges[1]?.to).toBe('table:shared_data')
  })

  it('emits one yaml Evidence per owns edge with sourceKind:yaml and matching file (spec §4.6)', async () => {
    const r = await coreTablesAnalyzer.run(
      makeCtx([{ ...baseDoc, id: 'db', schema_tables: ['accounts', 'transactions'] }]),
    )
    // Two tables → two evidence entries
    expect(r.evidence).toHaveLength(2)
    for (const ev of r.evidence) {
      expect(ev.sourceKind).toBe('yaml')
      expect(ev.file).toBe('.vibegraph/subsystems/db.yml')
    }
    // Evidence detail mentions the table name
    expect(r.evidence[0]?.detail).toContain('accounts')
    expect(r.evidence[1]?.detail).toContain('transactions')
    // Each owns edge references its evidence via evidenceIds (per yaml-source-attribution invariant)
    expect(r.edges).toHaveLength(2)
    expect(r.edges[0]?.evidenceIds).toEqual([r.evidence[0]?.id])
    expect(r.edges[1]?.evidenceIds).toEqual([r.evidence[1]?.id])
  })
})
