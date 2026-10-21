import { describe, expect, it } from 'vitest'
import type { ValidateDiffOutput } from './diff-validation.js'
import { ValidateDiffUiPayloadSchema, toValidateDiffUiPayload } from './validate-diff-ui-payload.js'

function edge(from: string, to: string) {
  return {
    id: `${from}->${to}`,
    from,
    to,
    kind: 'depends_on',
    category: 'domain',
    source: 'ast',
    confidence: 'high',
    evidenceIds: [],
    weight: 1,
    runtimeWeight: 0,
    typeOnlyWeight: 0,
    dynamicWeight: 0,
    metadata: { secret: 'x' },
    // biome-ignore lint/suspicious/noExplicitAny: test fixture
  } as any
}
function node(id: string) {
  return {
    id,
    kind: 'subsystem',
    title: id.replace('subsystem:', ''),
    layer: 'domain',
    status: 'unknown',
    tags: [],
    files: ['secret/path.ts'],
    metadata: { token: 'y' },
    // biome-ignore lint/suspicious/noExplicitAny: test fixture
  } as any
}
function fileNode(id: string) {
  return {
    id,
    kind: 'file',
    title: id.replace('file:', ''),
    layer: 'domain',
    status: 'unknown',
    tags: [],
    files: [],
    metadata: {},
    // biome-ignore lint/suspicious/noExplicitAny: test fixture
  } as any
}
const output = {
  status: 'warn',
  summary: 's',
  baselineSnapshotId: 'b1',
  newViolations: [
    {
      id: 'f1',
      domain: 'rule',
      type: 'rule-violation',
      detectorId: 'r',
      severity: 'medium',
      title: 'V',
      summary: 'leak me',
      involvedNodeIds: ['subsystem:core'],
      evidenceIds: [],
      status: 'open',
      metadata: { z: 1 },
    },
  ],
  removedViolations: [],
  newFindings: [],
  removedFindings: [],
  graphDelta: {
    newEdges: [edge('subsystem:cli', 'subsystem:mcp'), edge('file:a.ts', 'file:b.ts')],
    removedEdges: [edge('subsystem:ui', 'subsystem:core')],
    newNodes: [node('subsystem:new'), fileNode('file:added.ts')],
    removedNodes: [node('subsystem:gone'), fileNode('file:removed.ts')],
  },
  scope: {
    taskLinked: false,
    plannedFiles: [],
    changedFiles: [],
    deletedFiles: [],
    outOfScopeFiles: [],
    omittedGraphDelta: { newEdges: 0, removedEdges: 0, newNodes: 0, removedNodes: 0 },
  },
  riskDelta: { blastRadius: { 'subsystem:core': { before: 1, after: 2, delta: '+1' } } },
  recommendations: [],
  missingTests: [],
} as unknown as ValidateDiffOutput

describe('toValidateDiffUiPayload', () => {
  it('carries the conformance headline into the UI payload', () => {
    const out = {
      ...output,
      conformance: {
        headline: 'This change introduced 1 new cross-subsystem link (billing → analytics).',
        byKind: { cycles: 0, coupling: 1, boundaries: 0, orphans: 0 },
      },
    }
    const payload = toValidateDiffUiPayload(out as never)
    expect(payload.headline).toContain('billing → analytics')
  })

  it('keeps only subsystem edges and drops files/metadata/summary', () => {
    const p = toValidateDiffUiPayload(output)
    expect(ValidateDiffUiPayloadSchema.parse(p)).toEqual(p)
    expect(p.edges.added).toEqual([
      { from: 'subsystem:cli', to: 'subsystem:mcp', kind: 'depends_on' },
    ])
    expect(p.edges.removed).toEqual([
      { from: 'subsystem:ui', to: 'subsystem:core', kind: 'depends_on' },
    ])
    expect(p.nodes.added).toEqual([{ id: 'subsystem:new', kind: 'subsystem', title: 'new' }])
    expect(p.nodes.removed).toEqual([{ id: 'subsystem:gone', title: 'gone' }])
    expect(p.blastRadius).toEqual([{ id: 'subsystem:core', before: 1, after: 2, delta: '+1' }])
    expect(p.violations.added[0]).toEqual({
      id: 'f1',
      title: 'V',
      severity: 'medium',
      involvedNodeIds: ['subsystem:core'],
    })
    expect(p.counts).toEqual({
      addedEdges: 1,
      removedEdges: 1,
      newViolations: 1,
      removedViolations: 0,
      newFindings: 0,
      resolvedFindings: 0,
    })
  })
})
