import { pino } from 'pino'
import { describe, expect, it } from 'vitest'
import type { Edge } from '../schema/edge.js'
import type { Node } from '../schema/node.js'
import type { Snapshot } from '../schema/snapshot.js'
import { buildLoadedSnapshot } from '../snapshot/load-snapshot.js'
import { coreOrphansDetector } from './core-orphans.js'

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

describe('coreOrphansDetector', () => {
  it('Test 5: has correct metadata', () => {
    expect(coreOrphansDetector.id).toBe('core/orphans')
    expect(coreOrphansDetector.domain).toBe('architecture')
    expect(coreOrphansDetector.description).toBe(
      'flags subsystems with no incoming or outgoing dependency edges',
    )
  })

  it('Test 1: orphan finding — s3 has no edges, s1→s2 are connected', async () => {
    const nodes = [
      makeNode('s1', 'subsystem'),
      makeNode('s2', 'subsystem'),
      makeNode('s3', 'subsystem'),
    ]
    const edges = [makeEdge('s1', 's2', 'depends_on')]
    const loaded = makeSnapshot(nodes, edges)

    const findings = await coreOrphansDetector.run({ snapshot: loaded, log: silentLog })

    expect(findings).toHaveLength(1)
    expect(findings[0]?.involvedNodeIds).toEqual(['s3'])
    expect(findings[0]?.type).toBe('orphan')
    expect(findings[0]?.detectorId).toBe('core/orphans')
    expect(findings[0]?.severity).toBe('low')
    expect(findings[0]?.id).toBe('fnd:core/orphans:s3')
    expect(findings[0]?.domain).toBe('architecture')
  })

  it('Test 2: no orphans when all subsystems are connected', async () => {
    const nodes = [
      makeNode('s1', 'subsystem'),
      makeNode('s2', 'subsystem'),
      makeNode('s3', 'subsystem'),
    ]
    // s1→s2, s2→s3, s3→s1 (cycle, but all connected)
    const edges = [
      makeEdge('s1', 's2', 'depends_on'),
      makeEdge('s2', 's3', 'depends_on'),
      makeEdge('s3', 's1', 'depends_on'),
    ]
    const loaded = makeSnapshot(nodes, edges)

    const findings = await coreOrphansDetector.run({ snapshot: loaded, log: silentLog })

    expect(findings).toHaveLength(0)
  })

  it('Test 3: external nodes do not count as dependencies — s1 still orphan', async () => {
    const nodes = [
      makeNode('s1', 'subsystem'),
      makeNode('ext1', 'external'),
      makeNode('file1', 'file'),
    ]
    // s1 depends on external, file depends on s1 — but no subsystem peers
    const edges = [makeEdge('s1', 'ext1', 'depends_on'), makeEdge('file1', 's1', 'depends_on')]
    const loaded = makeSnapshot(nodes, edges)

    const findings = await coreOrphansDetector.run({ snapshot: loaded, log: silentLog })

    expect(findings).toHaveLength(1)
    expect(findings[0]?.involvedNodeIds).toEqual(['s1'])
    expect(findings[0]?.severity).toBe('low')
  })

  it('Test 4: contains edges do not count — s1 with only contains edges is orphan', async () => {
    const nodes = [
      makeNode('s1', 'subsystem'),
      makeNode('file1', 'file'),
      makeNode('file2', 'file'),
      makeNode('file3', 'file'),
      makeNode('file4', 'file'),
      makeNode('file5', 'file'),
    ]
    // s1 contains 5 files — only structural, not dep edges
    const edges = [
      makeEdge('s1', 'file1', 'contains'),
      makeEdge('s1', 'file2', 'contains'),
      makeEdge('s1', 'file3', 'contains'),
      makeEdge('s1', 'file4', 'contains'),
      makeEdge('s1', 'file5', 'contains'),
    ]
    const loaded = makeSnapshot(nodes, edges)

    const findings = await coreOrphansDetector.run({ snapshot: loaded, log: silentLog })

    expect(findings).toHaveLength(1)
    expect(findings[0]?.involvedNodeIds).toEqual(['s1'])
    expect(findings[0]?.severity).toBe('low')
  })

  it('severity is always low', async () => {
    const nodes = [makeNode('solo', 'subsystem')]
    const loaded = makeSnapshot(nodes, [])

    const findings = await coreOrphansDetector.run({ snapshot: loaded, log: silentLog })

    expect(findings).toHaveLength(1)
    expect(findings[0]?.severity).toBe('low')
  })

  it('finding title and summary contain the subsystem title', async () => {
    const nodes = [makeNode('my-service', 'subsystem')]
    const loaded = makeSnapshot(nodes, [])

    const findings = await coreOrphansDetector.run({ snapshot: loaded, log: silentLog })

    expect(findings[0]?.title).toContain('my-service')
    expect(findings[0]?.summary).toContain('my-service')
  })

  it('empty snapshot produces no findings', async () => {
    const loaded = makeSnapshot([], [])

    const findings = await coreOrphansDetector.run({ snapshot: loaded, log: silentLog })

    expect(findings).toHaveLength(0)
  })

  it('non-subsystem nodes are not flagged', async () => {
    const nodes = [makeNode('file1', 'file'), makeNode('ext1', 'external')]
    const loaded = makeSnapshot(nodes, [])

    const findings = await coreOrphansDetector.run({ snapshot: loaded, log: silentLog })

    expect(findings).toHaveLength(0)
  })

  it('treats subsystems linked only by type-only edges as orphans', async () => {
    const nodes = [makeNode('subsystem:a', 'subsystem'), makeNode('subsystem:b', 'subsystem')]
    const edges = [makeTypeOnlyEdge('subsystem:a', 'subsystem:b', 'depends_on')]
    const findings = await coreOrphansDetector.run({
      snapshot: makeSnapshot(nodes, edges),
      log: silentLog,
    })
    expect(findings.map((f) => f.involvedNodeIds[0]).sort()).toEqual(['subsystem:a', 'subsystem:b'])
  })
})
