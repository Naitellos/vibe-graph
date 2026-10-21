import { describe, expect, it } from 'vitest'
import type { Edge } from '../schema/edge.js'
import type { Finding } from '../schema/finding.js'
import { collectNewCoupling } from './conformance.js'
import { buildConformance } from './conformance.js'

function edge(from: string, to: string, over: Partial<Edge> = {}): Edge {
  return {
    id: `${from}->${to}`,
    from,
    to,
    kind: 'depends_on',
    category: 'domain',
    source: 'ast',
    confidence: 'high',
    evidenceIds: ['ev1'],
    weight: 1,
    runtimeWeight: 1,
    typeOnlyWeight: 0,
    dynamicWeight: 0,
    metadata: {},
    ...over,
  }
}
const delta = (newEdges: Edge[]) => ({ newEdges, removedEdges: [], newNodes: [], removedNodes: [] })
const affected = (...ids: string[]) => new Set(ids)

describe('collectNewCoupling', () => {
  it('flags a new runtime subsystem→subsystem edge in scope', () => {
    const out = collectNewCoupling(
      delta([edge('subsystem:billing', 'subsystem:analytics')]),
      affected('subsystem:billing'),
    )
    expect(out).toHaveLength(1)
    expect(out[0].type).toBe('new-coupling')
    expect(out[0].title).toContain('billing → analytics')
    expect(out[0].involvedNodeIds).toEqual(['subsystem:billing', 'subsystem:analytics'])
    expect(out[0].evidenceIds).toEqual(['ev1'])
  })
  it('ignores purely type-only edges (FP guard)', () => {
    const typeOnly = edge('subsystem:billing', 'subsystem:analytics', {
      runtimeWeight: 0,
      typeOnlyWeight: 1,
    })
    expect(collectNewCoupling(delta([typeOnly]), affected('subsystem:billing'))).toHaveLength(0)
  })
  it('ignores edges not touching an affected subsystem (scope guard)', () => {
    const out = collectNewCoupling(
      delta([edge('subsystem:a', 'subsystem:b')]),
      affected('subsystem:billing'),
    )
    expect(out).toHaveLength(0)
  })
  it('ignores non-subsystem (file-level) edges', () => {
    const out = collectNewCoupling(delta([edge('file:a.ts', 'file:b.ts')]), affected('file:a.ts'))
    expect(out).toHaveLength(0)
  })
})

function finding(over: Partial<Finding>): Finding {
  return {
    id: 'f',
    domain: 'architecture',
    type: 'new-coupling',
    detectorId: 'core/diff',
    severity: 'low',
    title: '',
    summary: '',
    involvedNodeIds: [],
    evidenceIds: [],
    status: 'open',
    metadata: {},
    ...over,
  }
}

describe('buildConformance', () => {
  it('returns undefined when nothing of interest is new', () => {
    expect(buildConformance([], [])).toBeUndefined()
  })
  it('counts coupling + cycles and writes a headline', () => {
    const coupling = finding({
      type: 'new-coupling',
      title: 'New coupling: billing → analytics (areas were independent)',
      involvedNodeIds: ['subsystem:billing', 'subsystem:analytics'],
    })
    const cycle = finding({
      type: 'cycle',
      title: 'Cyclic dependency: billing ↔ analytics',
      severity: 'high',
    })
    const c = buildConformance([coupling, cycle], [])
    expect(c?.byKind).toEqual({ cycles: 1, coupling: 1, boundaries: 0, orphans: 0 })
    expect(c?.headline).toContain('1 new cross-subsystem link')
    expect(c?.headline).toContain('1 new cycle')
  })
  it('counts boundary violations from newViolations', () => {
    const v = finding({
      domain: 'rule',
      type: 'rule-violation',
      title: 'Boundary violation (billing-locked): billing accesses analytics',
    })
    expect(buildConformance([], [v])?.byKind.boundaries).toBe(1)
  })
  it('counts one cycle once even when both the detector and the no-new-cycles rule fire', () => {
    const detector = finding({
      type: 'cycle',
      title: 'Cyclic dependency: billing ↔ analytics',
      severity: 'high',
      involvedNodeIds: ['subsystem:analytics', 'subsystem:billing'],
    })
    const rule = finding({
      domain: 'rule',
      type: 'rule-violation',
      title: 'New cycle (no_cycles): billing → analytics → billing',
      involvedNodeIds: ['subsystem:billing', 'subsystem:analytics'],
    })
    const c = buildConformance([detector], [rule])
    expect(c?.byKind.cycles).toBe(1)
    expect(c?.headline).toContain('1 new cycle')
    expect(c?.headline).not.toContain('2 new cycle')
  })
  it('does NOT count a drift undeclared finding as coupling (type-only safety)', () => {
    const undeclared = finding({
      type: 'undeclared',
      involvedNodeIds: ['subsystem:alpha', 'subsystem:beta'],
    })
    const c = buildConformance([undeclared], [])
    // undeclared alone must NOT produce a coupling headline — coupling comes only from runtime new-coupling
    expect(c?.byKind.coupling ?? 0).toBe(0)
    if (c) expect(c.headline).not.toContain('cross-subsystem link')
  })
})
