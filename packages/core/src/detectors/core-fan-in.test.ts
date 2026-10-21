import { pino } from 'pino'
import { describe, expect, it } from 'vitest'
import type { Edge } from '../schema/edge.js'
import type { Node } from '../schema/node.js'
import type { Snapshot } from '../schema/snapshot.js'
import { buildLoadedSnapshot } from '../snapshot/load-snapshot.js'
import { coreFanInDetector } from './core-fan-in.js'

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

describe('coreFanInDetector', () => {
  it('has the correct detector metadata', () => {
    expect(coreFanInDetector.id).toBe('core/fan-in')
    expect(coreFanInDetector.domain).toBe('architecture')
    expect(typeof coreFanInDetector.description).toBe('string')
    expect(coreFanInDetector.description.length).toBeGreaterThan(0)
  })

  it('Test 1: emits finding for subsystem with 9 incoming edges from other subsystems', async () => {
    // sink receives from s1..s9 (9 incoming, threshold=8)
    const nodes = [
      makeNode('subsystem:sink', 'subsystem'),
      makeNode('subsystem:s1', 'subsystem'),
      makeNode('subsystem:s2', 'subsystem'),
      makeNode('subsystem:s3', 'subsystem'),
      makeNode('subsystem:s4', 'subsystem'),
      makeNode('subsystem:s5', 'subsystem'),
      makeNode('subsystem:s6', 'subsystem'),
      makeNode('subsystem:s7', 'subsystem'),
      makeNode('subsystem:s8', 'subsystem'),
      makeNode('subsystem:s9', 'subsystem'),
    ]
    const edges = [
      makeEdge('subsystem:s1', 'subsystem:sink', 'depends_on'),
      makeEdge('subsystem:s2', 'subsystem:sink', 'depends_on'),
      makeEdge('subsystem:s3', 'subsystem:sink', 'depends_on'),
      makeEdge('subsystem:s4', 'subsystem:sink', 'depends_on'),
      makeEdge('subsystem:s5', 'subsystem:sink', 'depends_on'),
      makeEdge('subsystem:s6', 'subsystem:sink', 'depends_on'),
      makeEdge('subsystem:s7', 'subsystem:sink', 'depends_on'),
      makeEdge('subsystem:s8', 'subsystem:sink', 'depends_on'),
      makeEdge('subsystem:s9', 'subsystem:sink', 'depends_on'),
    ]
    const loaded = makeSnapshot(nodes, edges)
    const findings = await coreFanInDetector.run({ snapshot: loaded, log: silentLog })

    expect(findings).toHaveLength(1)
    expect(findings[0]?.type).toBe('high-fan-in')
    expect(findings[0]?.detectorId).toBe('core/fan-in')
    expect(findings[0]?.involvedNodeIds).toEqual(['subsystem:sink'])
    expect(['high', 'medium']).toContain(findings[0]?.severity)
  })

  it('Test 2: returns no findings for subsystem with 7 incoming edges (under threshold 8)', async () => {
    const nodes = [
      makeNode('subsystem:sink', 'subsystem'),
      makeNode('subsystem:s1', 'subsystem'),
      makeNode('subsystem:s2', 'subsystem'),
      makeNode('subsystem:s3', 'subsystem'),
      makeNode('subsystem:s4', 'subsystem'),
      makeNode('subsystem:s5', 'subsystem'),
      makeNode('subsystem:s6', 'subsystem'),
      makeNode('subsystem:s7', 'subsystem'),
    ]
    const edges = [
      makeEdge('subsystem:s1', 'subsystem:sink', 'depends_on'),
      makeEdge('subsystem:s2', 'subsystem:sink', 'depends_on'),
      makeEdge('subsystem:s3', 'subsystem:sink', 'depends_on'),
      makeEdge('subsystem:s4', 'subsystem:sink', 'depends_on'),
      makeEdge('subsystem:s5', 'subsystem:sink', 'depends_on'),
      makeEdge('subsystem:s6', 'subsystem:sink', 'depends_on'),
      makeEdge('subsystem:s7', 'subsystem:sink', 'depends_on'),
    ]
    const loaded = makeSnapshot(nodes, edges)
    const findings = await coreFanInDetector.run({ snapshot: loaded, log: silentLog })

    expect(findings).toHaveLength(0)
  })

  it('Test 3: adaptive severity — top 10% get high, rest get medium', async () => {
    // 10 subsystems all over threshold (degree >= 8) with varied in-degrees
    // top 10% of 10 = ceil(1.0) = 1 → top 1 by in-degree should be 'high'
    // degrees: sink0=15, sink1=14, sink2=10, sink3=9, sink4=9, sink5=9, sink6=8, sink7=8, sink8=8, sink9=8
    // Top 1 = sink0(15) → 'high'; rest → 'medium'

    // Create source subsystems (up to 15 sources)
    const sourceNodes: Node[] = []
    for (let i = 1; i <= 15; i++) {
      sourceNodes.push(makeNode(`subsystem:source${i}`, 'subsystem'))
    }

    const sinkNodes: Node[] = []
    for (let i = 0; i < 10; i++) {
      sinkNodes.push(makeNode(`subsystem:sink${i}`, 'subsystem'))
    }

    const degrees = [15, 14, 10, 9, 9, 9, 8, 8, 8, 8]

    const edges: Edge[] = []
    for (let i = 0; i < 10; i++) {
      const deg = degrees[i] ?? 0
      for (let j = 0; j < deg; j++) {
        edges.push(makeEdge(`subsystem:source${j + 1}`, `subsystem:sink${i}`, 'depends_on'))
      }
    }

    const loaded = makeSnapshot([...sinkNodes, ...sourceNodes], edges)
    const findings = await coreFanInDetector.run({ snapshot: loaded, log: silentLog })

    // All 10 sinks are over threshold (all degrees >= 8)
    expect(findings).toHaveLength(10)

    const highFindings = findings.filter((f) => f.severity === 'high')
    const mediumFindings = findings.filter((f) => f.severity === 'medium')

    // Top 1 by degree should be 'high'
    expect(highFindings).toHaveLength(1)
    expect(mediumFindings).toHaveLength(9)

    // sink0 (degree 15) should be 'high'
    const highIds = highFindings.flatMap((f) => f.involvedNodeIds)
    expect(highIds).toContain('subsystem:sink0')
  })

  it('Test 4: external sources are excluded from degree count', async () => {
    // sink with 8 edges incoming from external nodes → count = 0 → no finding
    const nodes = [
      makeNode('subsystem:sink', 'subsystem'),
      makeNode('external:lib1', 'external'),
      makeNode('external:lib2', 'external'),
      makeNode('external:lib3', 'external'),
      makeNode('external:lib4', 'external'),
      makeNode('external:lib5', 'external'),
      makeNode('external:lib6', 'external'),
      makeNode('external:lib7', 'external'),
      makeNode('external:lib8', 'external'),
    ]
    const edges = [
      makeEdge('external:lib1', 'subsystem:sink', 'depends_on'),
      makeEdge('external:lib2', 'subsystem:sink', 'depends_on'),
      makeEdge('external:lib3', 'subsystem:sink', 'depends_on'),
      makeEdge('external:lib4', 'subsystem:sink', 'depends_on'),
      makeEdge('external:lib5', 'subsystem:sink', 'depends_on'),
      makeEdge('external:lib6', 'subsystem:sink', 'depends_on'),
      makeEdge('external:lib7', 'subsystem:sink', 'depends_on'),
      makeEdge('external:lib8', 'subsystem:sink', 'depends_on'),
    ]
    const loaded = makeSnapshot(nodes, edges)
    const findings = await coreFanInDetector.run({ snapshot: loaded, log: silentLog })

    expect(findings).toHaveLength(0)
  })

  it('Test 5: contains edges are not counted as dependency edges', async () => {
    // sink with 9 contains edges incoming from files → no finding (contains not a dep edge)
    const nodes = [
      makeNode('subsystem:sink', 'subsystem'),
      makeNode('file:f1', 'file'),
      makeNode('file:f2', 'file'),
      makeNode('file:f3', 'file'),
      makeNode('file:f4', 'file'),
      makeNode('file:f5', 'file'),
      makeNode('file:f6', 'file'),
      makeNode('file:f7', 'file'),
      makeNode('file:f8', 'file'),
      makeNode('file:f9', 'file'),
    ]
    // Note: contains is typically from subsystem to file, but we're testing
    // that contains edges from anything to sink are not counted
    const edges = [
      makeEdge('file:f1', 'subsystem:sink', 'contains'),
      makeEdge('file:f2', 'subsystem:sink', 'contains'),
      makeEdge('file:f3', 'subsystem:sink', 'contains'),
      makeEdge('file:f4', 'subsystem:sink', 'contains'),
      makeEdge('file:f5', 'subsystem:sink', 'contains'),
      makeEdge('file:f6', 'subsystem:sink', 'contains'),
      makeEdge('file:f7', 'subsystem:sink', 'contains'),
      makeEdge('file:f8', 'subsystem:sink', 'contains'),
      makeEdge('file:f9', 'subsystem:sink', 'contains'),
    ]
    const loaded = makeSnapshot(nodes, edges)
    const findings = await coreFanInDetector.run({ snapshot: loaded, log: silentLog })

    expect(findings).toHaveLength(0)
  })

  it('ignores purely type-only incoming edges (8 type-only → in-degree 0, no finding)', async () => {
    const nodes = [
      makeNode('subsystem:target', 'subsystem'),
      makeNode('subsystem:src1', 'subsystem'),
      makeNode('subsystem:src2', 'subsystem'),
      makeNode('subsystem:src3', 'subsystem'),
      makeNode('subsystem:src4', 'subsystem'),
      makeNode('subsystem:src5', 'subsystem'),
      makeNode('subsystem:src6', 'subsystem'),
      makeNode('subsystem:src7', 'subsystem'),
      makeNode('subsystem:src8', 'subsystem'),
    ]
    const edges = [
      makeTypeOnlyEdge('subsystem:src1', 'subsystem:target', 'depends_on'),
      makeTypeOnlyEdge('subsystem:src2', 'subsystem:target', 'depends_on'),
      makeTypeOnlyEdge('subsystem:src3', 'subsystem:target', 'depends_on'),
      makeTypeOnlyEdge('subsystem:src4', 'subsystem:target', 'depends_on'),
      makeTypeOnlyEdge('subsystem:src5', 'subsystem:target', 'depends_on'),
      makeTypeOnlyEdge('subsystem:src6', 'subsystem:target', 'depends_on'),
      makeTypeOnlyEdge('subsystem:src7', 'subsystem:target', 'depends_on'),
      makeTypeOnlyEdge('subsystem:src8', 'subsystem:target', 'depends_on'),
    ]
    const loaded = makeSnapshot(nodes, edges)
    const findings = await coreFanInDetector.run({ snapshot: loaded, log: silentLog })
    expect(findings).toHaveLength(0)
  })

  it('edge case: single subsystem over threshold is always high (top 10% of 1 = 1)', async () => {
    // One sink node with 9 subsystem sources (above threshold 8), only 1 total → top 10% = 1
    const nodes = [
      makeNode('subsystem:sink', 'subsystem'),
      makeNode('subsystem:s1', 'subsystem'),
      makeNode('subsystem:s2', 'subsystem'),
      makeNode('subsystem:s3', 'subsystem'),
      makeNode('subsystem:s4', 'subsystem'),
      makeNode('subsystem:s5', 'subsystem'),
      makeNode('subsystem:s6', 'subsystem'),
      makeNode('subsystem:s7', 'subsystem'),
      makeNode('subsystem:s8', 'subsystem'),
      makeNode('subsystem:s9', 'subsystem'),
    ]
    const edges = [
      makeEdge('subsystem:s1', 'subsystem:sink', 'depends_on'),
      makeEdge('subsystem:s2', 'subsystem:sink', 'depends_on'),
      makeEdge('subsystem:s3', 'subsystem:sink', 'depends_on'),
      makeEdge('subsystem:s4', 'subsystem:sink', 'depends_on'),
      makeEdge('subsystem:s5', 'subsystem:sink', 'depends_on'),
      makeEdge('subsystem:s6', 'subsystem:sink', 'depends_on'),
      makeEdge('subsystem:s7', 'subsystem:sink', 'depends_on'),
      makeEdge('subsystem:s8', 'subsystem:sink', 'depends_on'),
      makeEdge('subsystem:s9', 'subsystem:sink', 'depends_on'),
    ]
    const loaded = makeSnapshot(nodes, edges)
    const findings = await coreFanInDetector.run({ snapshot: loaded, log: silentLog })

    expect(findings).toHaveLength(1)
    expect(findings[0]?.severity).toBe('high')
  })
})
