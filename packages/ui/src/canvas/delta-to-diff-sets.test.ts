import { describe, expect, it } from 'vitest'
import { deltaToDiffSets, nodeDiffKind } from './delta-to-diff-sets.js'

const payload = {
  status: 'warn',
  baselineSnapshotId: 'b',
  edges: {
    added: [
      { from: 'subsystem:cli', to: 'subsystem:mcp', kind: 'depends_on' },
      { from: 'subsystem:cli', to: 'subsystem:gone', kind: 'depends_on' },
    ],
    removed: [{ from: 'subsystem:ui', to: 'subsystem:core', kind: 'depends_on' }],
  },
  nodes: {
    added: [{ id: 'subsystem:new', kind: 'subsystem', title: 'new' }],
    removed: [{ id: 'subsystem:gone', title: 'gone' }],
  },
  blastRadius: [
    { id: 'subsystem:core', before: 1, after: 2, delta: '+1' },
    { id: 'subsystem:mcp', before: 0, after: 0, delta: '0' },
  ],
  violations: {
    added: [{ id: 'v1', title: 'V', severity: 'high', involvedNodeIds: ['subsystem:mcp'] }],
    removed: [],
  },
  findings: { added: [], removed: [] },
  counts: {
    addedEdges: 2,
    removedEdges: 1,
    newViolations: 1,
    removedViolations: 0,
    newFindings: 0,
    resolvedFindings: 0,
  },
} as const

describe('deltaToDiffSets', () => {
  const present = new Set(['subsystem:cli', 'subsystem:mcp', 'subsystem:core', 'subsystem:ui'])
  const r = deltaToDiffSets(payload as never, present)

  it('keeps only edges whose both endpoints are present', () => {
    expect(r.addedEdges).toEqual([{ from: 'subsystem:cli', to: 'subsystem:mcp' }])
    expect(r.removedEdges).toEqual([{ from: 'subsystem:ui', to: 'subsystem:core' }])
  })
  it('changed = edge endpoints ∪ nonzero blast ∪ violation nodes; badges only for nonzero blast', () => {
    expect(r.changedNodeIds.has('subsystem:core')).toBe(true)
    expect(r.violationNodeIds.has('subsystem:mcp')).toBe(true)
    expect(r.blastBadges.get('subsystem:core')).toBe('+1')
    expect(r.blastBadges.has('subsystem:mcp')).toBe(false)
  })
  it('removed subsystem nodes go to summary only; added node absent from layout not in addedNodeIds', () => {
    expect(r.summary.removedNodeIds).toEqual(['subsystem:gone'])
    expect(r.addedNodeIds.has('subsystem:new')).toBe(false)
  })
  it('summary carries both-direction counts', () => {
    expect(r.summary).toMatchObject({
      status: 'warn',
      addedEdgeCount: 1,
      removedEdgeCount: 1,
      newViolationCount: 1,
      removedViolationCount: 0,
      resolvedFindingCount: 0,
    })
  })
})

describe('nodeDiffKind precedence', () => {
  it('returns violation when id is in both violationNodeIds and changedNodeIds', () => {
    const s = {
      addedEdges: [],
      removedEdges: [],
      addedNodeIds: new Set<string>(),
      changedNodeIds: new Set(['subsystem:mcp']),
      violationNodeIds: new Set(['subsystem:mcp']),
      blastBadges: new Map<string, string>(),
      summary: {
        status: 'warn',
        addedEdgeCount: 0,
        removedEdgeCount: 0,
        newViolationCount: 1,
        removedViolationCount: 0,
        resolvedFindingCount: 0,
        removedNodeIds: [],
      },
    }
    expect(nodeDiffKind('subsystem:mcp', s)).toBe('violation')
  })
  it('returns added over changed', () => {
    const s = {
      addedEdges: [],
      removedEdges: [],
      addedNodeIds: new Set(['subsystem:new']),
      changedNodeIds: new Set(['subsystem:new']),
      violationNodeIds: new Set<string>(),
      blastBadges: new Map<string, string>(),
      summary: {
        status: 'ok',
        addedEdgeCount: 0,
        removedEdgeCount: 0,
        newViolationCount: 0,
        removedViolationCount: 0,
        resolvedFindingCount: 0,
        removedNodeIds: [],
      },
    }
    expect(nodeDiffKind('subsystem:new', s)).toBe('added')
  })
  it('returns changed when only in changedNodeIds', () => {
    const s = {
      addedEdges: [],
      removedEdges: [],
      addedNodeIds: new Set<string>(),
      changedNodeIds: new Set(['subsystem:core']),
      violationNodeIds: new Set<string>(),
      blastBadges: new Map<string, string>(),
      summary: {
        status: 'ok',
        addedEdgeCount: 0,
        removedEdgeCount: 0,
        newViolationCount: 0,
        removedViolationCount: 0,
        resolvedFindingCount: 0,
        removedNodeIds: [],
      },
    }
    expect(nodeDiffKind('subsystem:core', s)).toBe('changed')
  })
  it('returns undefined when id not in any set', () => {
    const s = {
      addedEdges: [],
      removedEdges: [],
      addedNodeIds: new Set<string>(),
      changedNodeIds: new Set<string>(),
      violationNodeIds: new Set<string>(),
      blastBadges: new Map<string, string>(),
      summary: {
        status: 'ok',
        addedEdgeCount: 0,
        removedEdgeCount: 0,
        newViolationCount: 0,
        removedViolationCount: 0,
        resolvedFindingCount: 0,
        removedNodeIds: [],
      },
    }
    expect(nodeDiffKind('subsystem:unknown', s)).toBeUndefined()
  })
})
