import { pino } from 'pino'
import { describe, expect, it } from 'vitest'
import type { Edge } from '../schema/edge.js'
import type { Node } from '../schema/node.js'
import type { Snapshot } from '../schema/snapshot.js'
import { buildLoadedSnapshot } from '../snapshot/load-snapshot.js'
import { coreCyclesDetector } from './core-cycles.js'

// ── Test helpers ──────────────────────────────────────────────────────────────
//
// End-to-end coverage of the cycles detector against an on-disk fixture lives
// in `packages/core/test/fixtures/synthetic.test.ts` (the "fixtures" vitest
// project, testTimeout: 10_000 — sized for a full scan() pipeline). The tests
// in this file exercise the detector against in-memory snapshots only so they
// stay fast and reliable in the unit suite (default 5s timeout).

const silentLog = pino({ level: 'silent' })

function makeNode(id: string, kind: Node['kind']): Node {
  return {
    id,
    kind,
    title: id,
    layer: 'unknown',
    status: 'unknown',
    tags: [],
    files: [],
    metadata: {},
  }
}

function makeEdge(from: string, to: string, kind: Edge['kind']): Edge {
  return {
    id: `edge:${from}:${to}:${kind}`,
    from,
    to,
    kind,
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

function makeTypeOnlyEdge(from: string, to: string, kind: Edge['kind']): Edge {
  return { ...makeEdge(from, to, kind), typeOnlyWeight: 1, runtimeWeight: 0, dynamicWeight: 0 }
}

function makeSnapshot(nodes: Node[], edges: Edge[]): ReturnType<typeof buildLoadedSnapshot> {
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

// ── Tests ─────────────────────────────────────────────────────────────────────

describe('coreCyclesDetector', () => {
  it('returns no findings when there are no cycles (a→b→c DAG)', async () => {
    const nodes = [
      makeNode('subsystem:a', 'subsystem'),
      makeNode('subsystem:b', 'subsystem'),
      makeNode('subsystem:c', 'subsystem'),
    ]
    const edges = [
      makeEdge('subsystem:a', 'subsystem:b', 'depends_on'),
      makeEdge('subsystem:b', 'subsystem:c', 'depends_on'),
    ]
    const loaded = makeSnapshot(nodes, edges)
    const findings = await coreCyclesDetector.run({ snapshot: loaded, log: silentLog })

    expect(findings).toHaveLength(0)
  })

  it('detects 3-cycle (a→b→c→a)', async () => {
    const nodes = [
      makeNode('subsystem:a', 'subsystem'),
      makeNode('subsystem:b', 'subsystem'),
      makeNode('subsystem:c', 'subsystem'),
    ]
    const edges = [
      makeEdge('subsystem:a', 'subsystem:b', 'depends_on'),
      makeEdge('subsystem:b', 'subsystem:c', 'depends_on'),
      makeEdge('subsystem:c', 'subsystem:a', 'depends_on'),
    ]
    const loaded = makeSnapshot(nodes, edges)
    const findings = await coreCyclesDetector.run({ snapshot: loaded, log: silentLog })

    expect(findings).toHaveLength(1)
    expect(findings[0]?.type).toBe('cycle')
    expect(findings[0]?.severity).toBe('high')
    expect(findings[0]?.involvedNodeIds.slice().sort()).toEqual([
      'subsystem:a',
      'subsystem:b',
      'subsystem:c',
    ])
  })

  it('does not include external nodes in cycle detection', async () => {
    // subsystem:a → subsystem:b → external:react (external can't cycle back)
    const nodes = [
      makeNode('subsystem:a', 'subsystem'),
      makeNode('subsystem:b', 'subsystem'),
      makeNode('external:react', 'external'),
    ]
    const edges = [
      makeEdge('subsystem:a', 'subsystem:b', 'depends_on'),
      makeEdge('subsystem:b', 'external:react', 'depends_on'),
    ]
    const loaded = makeSnapshot(nodes, edges)
    const findings = await coreCyclesDetector.run({ snapshot: loaded, log: silentLog })

    expect(findings).toHaveLength(0)
  })

  it('ignores contains-edges — not dependency edges', async () => {
    // subsystem:a -contains-> subsystem:b -contains-> subsystem:a
    // Even though there's a "cycle" via contains, it's not a dep-edge cycle
    const nodes = [makeNode('subsystem:a', 'subsystem'), makeNode('subsystem:b', 'subsystem')]
    const edges = [
      makeEdge('subsystem:a', 'subsystem:b', 'contains'),
      makeEdge('subsystem:b', 'subsystem:a', 'contains'),
    ]
    const loaded = makeSnapshot(nodes, edges)
    const findings = await coreCyclesDetector.run({ snapshot: loaded, log: silentLog })

    expect(findings).toHaveLength(0)
  })

  it('has the correct detector metadata', () => {
    expect(coreCyclesDetector.id).toBe('core/cycles')
    expect(coreCyclesDetector.domain).toBe('architecture')
    expect(typeof coreCyclesDetector.description).toBe('string')
    expect(coreCyclesDetector.description.length).toBeGreaterThan(0)
  })

  it('ignores purely type-only edges (no runtime cycle)', async () => {
    const nodes = [makeNode('subsystem:a', 'subsystem'), makeNode('subsystem:b', 'subsystem')]
    const edges = [
      makeTypeOnlyEdge('subsystem:a', 'subsystem:b', 'depends_on'),
      makeTypeOnlyEdge('subsystem:b', 'subsystem:a', 'depends_on'),
    ]
    const findings = await coreCyclesDetector.run({
      snapshot: makeSnapshot(nodes, edges),
      log: silentLog,
    })
    expect(findings).toHaveLength(0)
  })
})
