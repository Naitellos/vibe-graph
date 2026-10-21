import { describe, expect, it } from 'vitest'
import type { Edge } from '../../schema/edge.js'
import type { GraphBaseline } from '../../schema/graph-baseline.js'
import type { Node } from '../../schema/node.js'
import type { Snapshot } from '../../schema/snapshot.js'
import { buildLoadedSnapshot } from '../../snapshot/load-snapshot.js'
import type { BuiltinRule } from './no-new-cycles.js'
import { evaluateNoNewOrphans, isTestFile } from './no-new-orphans.js'

// ── Test helpers ──────────────────────────────────────────────────────────────

function makeSubsystemNode(id: string): Node {
  return {
    id,
    kind: 'subsystem',
    title: id.replace(/^subsystem:/, ''),
    layer: 'unknown',
    status: 'unknown',
    tags: [],
    files: [],
    metadata: {},
  }
}

function makeFileNode(id: string): Node {
  return {
    id,
    kind: 'file',
    title: id.replace(/^file:/, ''),
    layer: 'unknown',
    status: 'unknown',
    tags: [],
    files: [],
    metadata: {},
  }
}

function makeContainsEdge(from: string, to: string): Edge {
  return {
    id: `edge:${from}:${to}:contains`,
    from,
    to,
    kind: 'contains',
    category: 'structural',
    source: 'manual',
    confidence: 'high',
    evidenceIds: [],
    weight: 1,
    runtimeWeight: 0,
    typeOnlyWeight: 0,
    dynamicWeight: 0,
    metadata: {},
  }
}

function makeSnapshot(nodes: Node[], edges: Edge[]) {
  const snap: Snapshot = {
    meta: {
      schemaVersion: '0.1.0',
      scanId: 'test-scan',
      builtAt: new Date().toISOString(),
      projectRoot: '/test',
      projectName: 'test',
      vibegraphVersion: '0.0.0',
      scanDurationMs: 0,
      fileCounts: { scanned: 0, indexed: 0, skipped: 0 },
    },
    nodes,
    edges,
    evidence: [],
    findings: [],
  }
  return buildLoadedSnapshot(snap)
}

function makeBaseline(nodes: Node[], edges: Edge[]): GraphBaseline {
  return {
    schemaVersion: '1.0',
    snapshotId: 'baseline-snap',
    createdAt: new Date().toISOString(),
    fingerprint: 'fp-test',
    nodes,
    edges,
    findings: [],
  }
}

const testRule: BuiltinRule = {
  kind: 'builtin',
  id: 'no-new-orphans',
  severity: 'low',
  mode: 'advisory',
  check: 'no_orphans',
  title: 'No new orphans',
  description: '',
}

// ── Tests ─────────────────────────────────────────────────────────────────────

describe('evaluateNoNewOrphans', () => {
  it('no baseline → no findings (rule is no-op on first scan)', () => {
    // Even if working snapshot has orphan files, no baseline means no findings
    const nodes = [
      makeSubsystemNode('subsystem:core'),
      makeFileNode('file:src/owned.ts'),
      makeFileNode('file:src/orphan.ts'),
    ]
    // owned.ts is claimed by core; orphan.ts is not
    const edges = [makeContainsEdge('subsystem:core', 'file:src/owned.ts')]
    const snapshot = makeSnapshot(nodes, edges)

    const findings = evaluateNoNewOrphans(testRule, { snapshot, baseline: null })

    expect(findings).toHaveLength(0)
  })

  it('baseline has orphan A, working has same orphan A → no findings', () => {
    // Orphan A already existed in baseline; not a new orphan
    const nodes = [
      makeSubsystemNode('subsystem:core'),
      makeFileNode('file:src/owned.ts'),
      makeFileNode('file:src/orphan-a.ts'),
    ]
    const edges = [makeContainsEdge('subsystem:core', 'file:src/owned.ts')]

    const snapshot = makeSnapshot(nodes, edges)
    // Baseline has the same orphan
    const baseline = makeBaseline(nodes, edges)

    const findings = evaluateNoNewOrphans(testRule, { snapshot, baseline })

    expect(findings).toHaveLength(0)
  })

  it('baseline has orphan A, working has A + new orphan B → 1 finding for B', () => {
    // Baseline: subsystem:core owns owned.ts; orphan-a.ts is unowned
    const baselineNodes = [
      makeSubsystemNode('subsystem:core'),
      makeFileNode('file:src/owned.ts'),
      makeFileNode('file:src/orphan-a.ts'),
    ]
    const baselineEdges = [makeContainsEdge('subsystem:core', 'file:src/owned.ts')]

    // Working: adds orphan-b.ts which is also unowned
    const workingNodes = [
      makeSubsystemNode('subsystem:core'),
      makeFileNode('file:src/owned.ts'),
      makeFileNode('file:src/orphan-a.ts'),
      makeFileNode('file:src/orphan-b.ts'),
    ]
    const workingEdges = [makeContainsEdge('subsystem:core', 'file:src/owned.ts')]

    const snapshot = makeSnapshot(workingNodes, workingEdges)
    const baseline = makeBaseline(baselineNodes, baselineEdges)

    const findings = evaluateNoNewOrphans(testRule, { snapshot, baseline })

    expect(findings).toHaveLength(1)

    const f = findings[0]
    if (f === undefined) throw new Error('expected one finding')
    expect(f.id).toBe('rule:no-new-orphans:file:src/orphan-b.ts')
    expect(f.domain).toBe('rule')
    expect(f.type).toBe('rule-violation')
    expect(f.detectorId).toBe('rules-engine')
    expect(f.severity).toBe('low')
    expect(f.status).toBe('open')
    expect(f.title).toContain('no-new-orphans')
    expect(f.involvedNodeIds).toEqual(['file:src/orphan-b.ts'])
    expect(f.evidenceIds).toEqual([])
    expect(f.metadata).toMatchObject({ ruleId: 'no-new-orphans', mode: 'advisory' })
  })
})

describe('isTestFile', () => {
  // Across two fire-rate batches no-new-orphans was 31 of 32 total signals, and
  // roughly half were the `*.test.*` twin of the file being added — the agent
  // being told off for writing a test.
  it('matches the test/spec conventions this ecosystem uses', () => {
    for (const id of [
      'file:src/a.test.ts',
      'file:src/a.spec.tsx',
      'file:src/a.test.mjs',
      'file:__tests__/x.ts',
      'file:__mocks__/x.ts',
      'file:test/helpers.js',
      'file:src/tests/x.ts',
    ]) {
      expect(isTestFile(id), id).toBe(true)
    }
  })

  it('does not match production files that merely contain the substring', () => {
    for (const id of [
      'file:src/controllers/user.ts',
      'file:src/latest.ts',
      'file:src/protest.ts',
      'file:src/contest/index.ts',
      'file:src/testing.ts',
    ]) {
      expect(isTestFile(id), id).toBe(false)
    }
  })

  it('accepts a bare path as well as a file: node id', () => {
    expect(isTestFile('src/a.test.ts')).toBe(true)
  })
})
