import { pino } from 'pino'
import { describe, expect, it } from 'vitest'
import type { Edge } from '../schema/edge.js'
import type { Node } from '../schema/node.js'
import type { Snapshot } from '../schema/snapshot.js'
import { buildLoadedSnapshot } from '../snapshot/load-snapshot.js'
import { coreFanOutDetector } from './core-fan-out.js'

// ── Test helpers ──────────────────────────────────────────────────────────────

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

describe('coreFanOutDetector', () => {
  it('has the correct detector metadata', () => {
    expect(coreFanOutDetector.id).toBe('core/fan-out')
    expect(coreFanOutDetector.domain).toBe('architecture')
    expect(typeof coreFanOutDetector.description).toBe('string')
    expect(coreFanOutDetector.description.length).toBeGreaterThan(0)
  })

  it('Test 1: emits finding for subsystem with 8 outgoing edges to other subsystems', async () => {
    // hub -> t1..t8 (8 outgoing dependency edges to subsystems, threshold=6)
    const nodes = [
      makeNode('subsystem:hub', 'subsystem'),
      makeNode('subsystem:t1', 'subsystem'),
      makeNode('subsystem:t2', 'subsystem'),
      makeNode('subsystem:t3', 'subsystem'),
      makeNode('subsystem:t4', 'subsystem'),
      makeNode('subsystem:t5', 'subsystem'),
      makeNode('subsystem:t6', 'subsystem'),
      makeNode('subsystem:t7', 'subsystem'),
      makeNode('subsystem:t8', 'subsystem'),
    ]
    const edges = [
      makeEdge('subsystem:hub', 'subsystem:t1', 'depends_on'),
      makeEdge('subsystem:hub', 'subsystem:t2', 'depends_on'),
      makeEdge('subsystem:hub', 'subsystem:t3', 'depends_on'),
      makeEdge('subsystem:hub', 'subsystem:t4', 'depends_on'),
      makeEdge('subsystem:hub', 'subsystem:t5', 'depends_on'),
      makeEdge('subsystem:hub', 'subsystem:t6', 'depends_on'),
      makeEdge('subsystem:hub', 'subsystem:t7', 'depends_on'),
      makeEdge('subsystem:hub', 'subsystem:t8', 'depends_on'),
    ]
    const loaded = makeSnapshot(nodes, edges)
    const findings = await coreFanOutDetector.run({ snapshot: loaded, log: silentLog })

    expect(findings).toHaveLength(1)
    expect(findings[0]?.type).toBe('high-fan-out')
    expect(findings[0]?.detectorId).toBe('core/fan-out')
    expect(findings[0]?.involvedNodeIds).toEqual(['subsystem:hub'])
    expect(['high', 'medium']).toContain(findings[0]?.severity)
  })

  it('Test 2: returns no findings for subsystem with 5 outgoing edges (under threshold 6)', async () => {
    const nodes = [
      makeNode('subsystem:s1', 'subsystem'),
      makeNode('subsystem:t1', 'subsystem'),
      makeNode('subsystem:t2', 'subsystem'),
      makeNode('subsystem:t3', 'subsystem'),
      makeNode('subsystem:t4', 'subsystem'),
      makeNode('subsystem:t5', 'subsystem'),
    ]
    const edges = [
      makeEdge('subsystem:s1', 'subsystem:t1', 'depends_on'),
      makeEdge('subsystem:s1', 'subsystem:t2', 'depends_on'),
      makeEdge('subsystem:s1', 'subsystem:t3', 'depends_on'),
      makeEdge('subsystem:s1', 'subsystem:t4', 'depends_on'),
      makeEdge('subsystem:s1', 'subsystem:t5', 'depends_on'),
    ]
    const loaded = makeSnapshot(nodes, edges)
    const findings = await coreFanOutDetector.run({ snapshot: loaded, log: silentLog })

    expect(findings).toHaveLength(0)
  })

  it('Test 3: adaptive severity — top 15% get high, rest get medium', async () => {
    // 10 subsystems all over threshold with varied degrees
    // top 15% of 10 = ceil(1.5) = 2 → top 2 by degree should be 'high'
    // degrees: n0=15, n1=14, n2=8, n3=8, n4=7, n5=7, n6=7, n7=6, n8=6, n9=6
    // Top 2 = n0(15) and n1(14) → 'high'; rest → 'medium'

    // We need many target subsystems. Create target nodes t1..t15
    const targetNodes: Node[] = []
    for (let i = 1; i <= 15; i++) {
      targetNodes.push(makeNode(`subsystem:target${i}`, 'subsystem'))
    }

    const sourceNodes: Node[] = []
    for (let i = 0; i < 10; i++) {
      sourceNodes.push(makeNode(`subsystem:n${i}`, 'subsystem'))
    }

    const degrees = [15, 14, 8, 8, 7, 7, 7, 6, 6, 6]

    const edges: Edge[] = []
    for (let i = 0; i < 10; i++) {
      const deg = degrees[i] ?? 0
      for (let j = 0; j < deg; j++) {
        edges.push(makeEdge(`subsystem:n${i}`, `subsystem:target${j + 1}`, 'depends_on'))
      }
    }

    const loaded = makeSnapshot([...sourceNodes, ...targetNodes], edges)
    const findings = await coreFanOutDetector.run({ snapshot: loaded, log: silentLog })

    // All 10 are over threshold (all degrees >= 6)
    expect(findings).toHaveLength(10)

    const highFindings = findings.filter((f) => f.severity === 'high')
    const mediumFindings = findings.filter((f) => f.severity === 'medium')

    // Top 2 by degree should be 'high'
    expect(highFindings).toHaveLength(2)
    expect(mediumFindings).toHaveLength(8)

    // n0 (degree 15) and n1 (degree 14) should be 'high'
    const highIds = highFindings.flatMap((f) => f.involvedNodeIds)
    expect(highIds).toContain('subsystem:n0')
    expect(highIds).toContain('subsystem:n1')
  })

  it('Test 4: external targets are excluded from degree count', async () => {
    // s1 with 6 edges to external nodes → count = 0 → no finding
    const nodes = [
      makeNode('subsystem:s1', 'subsystem'),
      makeNode('external:lib1', 'external'),
      makeNode('external:lib2', 'external'),
      makeNode('external:lib3', 'external'),
      makeNode('external:lib4', 'external'),
      makeNode('external:lib5', 'external'),
      makeNode('external:lib6', 'external'),
    ]
    const edges = [
      makeEdge('subsystem:s1', 'external:lib1', 'depends_on'),
      makeEdge('subsystem:s1', 'external:lib2', 'depends_on'),
      makeEdge('subsystem:s1', 'external:lib3', 'depends_on'),
      makeEdge('subsystem:s1', 'external:lib4', 'depends_on'),
      makeEdge('subsystem:s1', 'external:lib5', 'depends_on'),
      makeEdge('subsystem:s1', 'external:lib6', 'depends_on'),
    ]
    const loaded = makeSnapshot(nodes, edges)
    const findings = await coreFanOutDetector.run({ snapshot: loaded, log: silentLog })

    expect(findings).toHaveLength(0)
  })

  it('Test 5: contains edges are not counted as dependency edges', async () => {
    // s1 with 8 contains edges to files → no finding (contains not a dep edge)
    const nodes = [
      makeNode('subsystem:s1', 'subsystem'),
      makeNode('file:f1', 'file'),
      makeNode('file:f2', 'file'),
      makeNode('file:f3', 'file'),
      makeNode('file:f4', 'file'),
      makeNode('file:f5', 'file'),
      makeNode('file:f6', 'file'),
      makeNode('file:f7', 'file'),
      makeNode('file:f8', 'file'),
    ]
    const edges = [
      makeEdge('subsystem:s1', 'file:f1', 'contains'),
      makeEdge('subsystem:s1', 'file:f2', 'contains'),
      makeEdge('subsystem:s1', 'file:f3', 'contains'),
      makeEdge('subsystem:s1', 'file:f4', 'contains'),
      makeEdge('subsystem:s1', 'file:f5', 'contains'),
      makeEdge('subsystem:s1', 'file:f6', 'contains'),
      makeEdge('subsystem:s1', 'file:f7', 'contains'),
      makeEdge('subsystem:s1', 'file:f8', 'contains'),
    ]
    const loaded = makeSnapshot(nodes, edges)
    const findings = await coreFanOutDetector.run({ snapshot: loaded, log: silentLog })

    expect(findings).toHaveLength(0)
  })

  it('ignores purely type-only outgoing edges (6 type-only → out-degree 0, no finding)', async () => {
    const nodes = [
      makeNode('subsystem:hub', 'subsystem'),
      makeNode('subsystem:t1', 'subsystem'),
      makeNode('subsystem:t2', 'subsystem'),
      makeNode('subsystem:t3', 'subsystem'),
      makeNode('subsystem:t4', 'subsystem'),
      makeNode('subsystem:t5', 'subsystem'),
      makeNode('subsystem:t6', 'subsystem'),
    ]
    const edges = [
      makeTypeOnlyEdge('subsystem:hub', 'subsystem:t1', 'depends_on'),
      makeTypeOnlyEdge('subsystem:hub', 'subsystem:t2', 'depends_on'),
      makeTypeOnlyEdge('subsystem:hub', 'subsystem:t3', 'depends_on'),
      makeTypeOnlyEdge('subsystem:hub', 'subsystem:t4', 'depends_on'),
      makeTypeOnlyEdge('subsystem:hub', 'subsystem:t5', 'depends_on'),
      makeTypeOnlyEdge('subsystem:hub', 'subsystem:t6', 'depends_on'),
    ]
    const loaded = makeSnapshot(nodes, edges)
    const findings = await coreFanOutDetector.run({ snapshot: loaded, log: silentLog })
    expect(findings).toHaveLength(0)
  })

  it('edge case: single subsystem over threshold is always high (top 15% of 1 = 1)', async () => {
    const nodes = [
      makeNode('subsystem:alone', 'subsystem'),
      makeNode('subsystem:t1', 'subsystem'),
      makeNode('subsystem:t2', 'subsystem'),
      makeNode('subsystem:t3', 'subsystem'),
      makeNode('subsystem:t4', 'subsystem'),
      makeNode('subsystem:t5', 'subsystem'),
      makeNode('subsystem:t6', 'subsystem'),
    ]
    const edges = [
      makeEdge('subsystem:alone', 'subsystem:t1', 'depends_on'),
      makeEdge('subsystem:alone', 'subsystem:t2', 'depends_on'),
      makeEdge('subsystem:alone', 'subsystem:t3', 'depends_on'),
      makeEdge('subsystem:alone', 'subsystem:t4', 'depends_on'),
      makeEdge('subsystem:alone', 'subsystem:t5', 'depends_on'),
      makeEdge('subsystem:alone', 'subsystem:t6', 'depends_on'),
    ]
    const loaded = makeSnapshot(nodes, edges)
    const findings = await coreFanOutDetector.run({ snapshot: loaded, log: silentLog })

    expect(findings).toHaveLength(1)
    expect(findings[0]?.severity).toBe('high')
  })
})
