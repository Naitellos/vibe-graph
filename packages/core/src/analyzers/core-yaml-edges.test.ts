import { describe, expect, it } from 'vitest'
import type { SubsystemDoc } from '../schema/subsystem-doc.js'
import { coreYamlEdgesAnalyzer } from './core-yaml-edges.js'
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
const baseDoc = {
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

describe('coreYamlEdgesAnalyzer', () => {
  it('emits 0 edges when no docs', async () => {
    const r = await coreYamlEdgesAnalyzer.run(makeCtx([]))
    expect(r.edges).toEqual([])
    expect(r.evidence).toEqual([])
  })

  it('emits one depends_on edge per entry', async () => {
    const r = await coreYamlEdgesAnalyzer.run(
      makeCtx([{ ...baseDoc, id: 'p', depends_on: ['a', 'b'] }]),
    )
    expect(r.edges).toHaveLength(2)
    expect(r.edges[0]?.from).toBe('subsystem:p')
    expect(r.edges[0]?.to).toBe('subsystem:a')
    expect(r.edges[0]?.source).toBe('yaml')
    expect(r.edges[0]?.confidence).toBe('high')
  })

  it('consumed_by emits inverse edges', async () => {
    const r = await coreYamlEdgesAnalyzer.run(
      makeCtx([{ ...baseDoc, id: 'p', consumed_by: ['dashboard'] }]),
    )
    expect(r.edges).toHaveLength(1)
    expect(r.edges[0]?.from).toBe('subsystem:dashboard')
    expect(r.edges[0]?.to).toBe('subsystem:p')
  })

  it('emits one evidence per edge with sourceKind=yaml', async () => {
    const r = await coreYamlEdgesAnalyzer.run(makeCtx([{ ...baseDoc, id: 'p', depends_on: ['a'] }]))
    expect(r.evidence).toHaveLength(1)
    expect(r.evidence[0]?.sourceKind).toBe('yaml')
    expect(r.evidence[0]?.file).toContain('subsystems/p.yml')
    expect(r.edges[0]?.evidenceIds).toEqual([r.evidence[0]?.id])
  })

  it('emits no nodes (subsystem nodes come from core-subsystems)', async () => {
    const r = await coreYamlEdgesAnalyzer.run(makeCtx([{ ...baseDoc, depends_on: ['y'] }]))
    expect(r.nodes).toEqual([])
  })

  it('handles multiple docs with cross-references', async () => {
    const r = await coreYamlEdgesAnalyzer.run(
      makeCtx([
        { ...baseDoc, id: 'a', depends_on: ['b'] },
        { ...baseDoc, id: 'b', consumed_by: ['a'] },
      ]),
    )
    expect(r.edges).toHaveLength(2)
    expect(r.edges.every((e) => e.from === 'subsystem:a' && e.to === 'subsystem:b')).toBe(true)
  })

  it('emits depends_on edges with runtimeWeight 1 (declarative dependency = runtime coupling)', async () => {
    const r = await coreYamlEdgesAnalyzer.run(makeCtx([{ ...baseDoc, id: 'a', depends_on: ['b'] }]))
    const dep = r.edges.find((e) => e.from === 'subsystem:a' && e.to === 'subsystem:b')
    expect(dep?.kind).toBe('depends_on')
    expect(dep?.runtimeWeight).toBe(1)
  })
})
