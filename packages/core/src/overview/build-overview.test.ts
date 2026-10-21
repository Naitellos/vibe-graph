// packages/core/src/overview/build-overview.test.ts

import { describe, expect, it } from 'vitest'

import { SnapshotSchema, buildLoadedSnapshot } from '../index.js'
import { buildOverview } from './build-overview.js'

const makeSnap = () =>
  SnapshotSchema.parse({
    meta: {
      schemaVersion: '0.1.0',
      scanId: '11111111-1111-4111-8111-111111111111',
      builtAt: '2026-05-25T00:00:00.000Z',
      projectRoot: '/abs',
      projectName: 'demo',
      vibegraphVersion: '0.0.0',
      scanDurationMs: 1,
      fileCounts: { scanned: 5, indexed: 5, skipped: 0 },
    },
    nodes: [
      { id: 'subsystem:a', kind: 'subsystem', title: 'A', layer: 'domain' },
      { id: 'subsystem:b', kind: 'subsystem', title: 'B', layer: 'domain' },
      { id: 'subsystem:c', kind: 'subsystem', title: 'C', layer: 'infra' },
      { id: 'file:src/a.ts', kind: 'file', title: 'a.ts' },
      { id: 'file:src/b.ts', kind: 'file', title: 'b.ts' },
      { id: 'external:react', kind: 'external', title: 'react' },
    ],
    edges: [
      // a depends on b and c — fanOut(a) = 2
      {
        id: 'e1',
        from: 'subsystem:a',
        to: 'subsystem:b',
        kind: 'depends_on',
        source: 'derived',
        confidence: 'high',
      },
      {
        id: 'e2',
        from: 'subsystem:a',
        to: 'subsystem:c',
        kind: 'depends_on',
        source: 'derived',
        confidence: 'high',
      },
      // b consumed by a — fanIn(b) = 1
      // c consumed by a — fanIn(c) = 1
      // file edge (NOT counted in hub degree since not subsystem)
      {
        id: 'e3',
        from: 'file:src/a.ts',
        to: 'file:src/b.ts',
        kind: 'imports',
        source: 'ast',
        confidence: 'high',
      },
    ],
    evidence: [],
    findings: [
      {
        id: 'f1',
        domain: 'architecture',
        type: 'cycle',
        detectorId: 'core/cycles',
        severity: 'high',
        title: 'cycle 1',
        summary: 's',
        involvedNodeIds: ['subsystem:a'],
      },
      {
        id: 'f2',
        domain: 'architecture',
        type: 'orphan',
        detectorId: 'core/orphans',
        severity: 'low',
        title: 'orphan 1',
        summary: 's',
        involvedNodeIds: ['subsystem:b'],
      },
      {
        id: 'f3',
        domain: 'architecture',
        type: 'high-fan-out',
        detectorId: 'core/fan-out',
        severity: 'medium',
        title: 'fanout 1',
        summary: 's',
        involvedNodeIds: ['subsystem:a'],
      },
    ],
  })

describe('buildOverview', () => {
  it('computes counts correctly', () => {
    const out = buildOverview(buildLoadedSnapshot(makeSnap()))
    expect(out.counts.subsystems).toBe(3)
    expect(out.counts.files).toBe(2)
    expect(out.counts.edges).toBe(3)
    expect(out.counts.findings).toBe(3)
    expect(out.counts.externalPackages).toBe(1)
  })

  it('extracts project meta', () => {
    const out = buildOverview(buildLoadedSnapshot(makeSnap()))
    expect(out.project.name).toBe('demo')
    expect(out.project.root).toBe('/abs')
    expect(out.project.snapshotBuiltAt).toBe('2026-05-25T00:00:00.000Z')
    expect(out.project.snapshotScanId).toBe('11111111-1111-4111-8111-111111111111')
  })

  it('groups layers by frequency', () => {
    const out = buildOverview(buildLoadedSnapshot(makeSnap()))
    // domain: 2 (subsystem:a, subsystem:b)
    // infra: 1 (subsystem:c)
    // unknown: 3 (2 files + 1 external — all default to 'unknown')
    expect(out.layers.find((l) => l.layer === 'domain')?.nodeCount).toBe(2)
    expect(out.layers.find((l) => l.layer === 'infra')?.nodeCount).toBe(1)
    expect(out.layers.find((l) => l.layer === 'unknown')?.nodeCount).toBe(3)
  })

  it('returns top 5 findings sorted by severity (high → medium → low)', () => {
    const out = buildOverview(buildLoadedSnapshot(makeSnap()))
    expect(out.topFindings).toHaveLength(3) // only 3 findings exist; cap at 5
    expect(out.topFindings[0]?.severity).toBe('high')
    expect(out.topFindings[1]?.severity).toBe('medium')
    expect(out.topFindings[2]?.severity).toBe('low')
  })

  it('returns top 3 hubs by combined degree', () => {
    const out = buildOverview(buildLoadedSnapshot(makeSnap()))
    // subsystem:a has fanOut=2 → combined 2
    // subsystem:b has fanIn=1 → combined 1
    // subsystem:c has fanIn=1 → combined 1
    expect(out.topHubs).toHaveLength(3)
    expect(out.topHubs[0]?.nodeId).toBe('subsystem:a')
    expect(out.topHubs[0]?.fanOut).toBe(2)
    expect(out.topHubs[0]?.fanIn).toBe(0)
    // tie-break: b before c alphabetically
    expect(out.topHubs[1]?.nodeId).toBe('subsystem:b')
    expect(out.topHubs[2]?.nodeId).toBe('subsystem:c')
  })

  it('hub degree excludes file-level imports edges', () => {
    const out = buildOverview(buildLoadedSnapshot(makeSnap()))
    // The e3 file→file imports edge should NOT contribute to any subsystem's hub degree.
    // All counted edges should be subsystem→subsystem only.
    for (const hub of out.topHubs) {
      expect(hub.fanIn + hub.fanOut).toBeLessThanOrEqual(2)
    }
  })

  it('attaches location from first resolved evidence to a finding', () => {
    const snap = SnapshotSchema.parse({
      meta: {
        schemaVersion: '0.1.0',
        scanId: '11111111-1111-4111-8111-111111111111',
        builtAt: '2026-05-25T00:00:00.000Z',
        projectRoot: '/abs',
        projectName: 'demo',
        vibegraphVersion: '0.0.0',
        scanDurationMs: 1,
        fileCounts: { scanned: 1, indexed: 1, skipped: 0 },
      },
      nodes: [{ id: 'subsystem:a', kind: 'subsystem', title: 'A' }],
      edges: [],
      evidence: [
        {
          id: 'ev1',
          sourceKind: 'ast',
          file: 'src/a.ts',
          line: 42,
          detail: 'found it',
          confidence: 'high',
        },
      ],
      findings: [
        {
          id: 'f1',
          domain: 'architecture',
          type: 'cycle',
          detectorId: 'core/cycles',
          severity: 'high',
          title: 'cycle with evidence',
          summary: 's',
          involvedNodeIds: ['subsystem:a'],
          evidenceIds: ['ev1'],
        },
        {
          id: 'f2',
          domain: 'architecture',
          type: 'orphan',
          detectorId: 'core/orphans',
          severity: 'low',
          title: 'orphan no evidence',
          summary: 's',
          involvedNodeIds: ['subsystem:a'],
          evidenceIds: [],
        },
      ],
    })
    const out = buildOverview(buildLoadedSnapshot(snap))
    // finding with evidence → location resolved
    expect(out.topFindings[0]?.location).toEqual({ file: 'src/a.ts', line: 42 })
    // finding with empty evidenceIds → location undefined
    expect(out.topFindings[1]?.location).toBeUndefined()
  })

  it('omits line when evidence has no line, and ignores dangling evidence ids', () => {
    const snap = SnapshotSchema.parse({
      meta: {
        schemaVersion: '0.1.0',
        scanId: '22222222-2222-4222-8222-222222222222',
        builtAt: '2026-05-25T00:00:00.000Z',
        projectRoot: '/abs',
        projectName: 'demo',
        vibegraphVersion: '0.0.0',
        scanDurationMs: 1,
        fileCounts: { scanned: 1, indexed: 1, skipped: 0 },
      },
      nodes: [{ id: 'subsystem:a', kind: 'subsystem', title: 'A' }],
      edges: [],
      evidence: [
        { id: 'evNoLine', sourceKind: 'ast', file: 'src/b.ts', detail: 'x', confidence: 'high' },
      ],
      findings: [
        {
          id: 'f1',
          domain: 'architecture',
          type: 'cycle',
          detectorId: 'd',
          severity: 'high',
          title: 'no-line evidence',
          summary: 's',
          involvedNodeIds: ['subsystem:a'],
          evidenceIds: ['evNoLine'],
        },
        {
          id: 'f2',
          domain: 'architecture',
          type: 'orphan',
          detectorId: 'd',
          severity: 'low',
          title: 'dangling id',
          summary: 's',
          involvedNodeIds: ['subsystem:a'],
          evidenceIds: ['ghost-id'],
        },
      ],
    })
    const out = buildOverview(buildLoadedSnapshot(snap))
    // evidence without a line → location has file only (no line key)
    expect(out.topFindings[0]?.location).toEqual({ file: 'src/b.ts' })
    // dangling evidence id (not in evidence map) → location undefined
    expect(out.topFindings[1]?.location).toBeUndefined()
  })

  it('caps topFindings at 5', () => {
    // Construct a snapshot with 7 findings — verify only 5 returned.
    const snap = SnapshotSchema.parse({
      meta: {
        schemaVersion: '0.1.0',
        scanId: '11111111-1111-4111-8111-111111111111',
        builtAt: '2026-05-25T00:00:00.000Z',
        projectRoot: '/abs',
        projectName: 'demo',
        vibegraphVersion: '0.0.0',
        scanDurationMs: 1,
        fileCounts: { scanned: 0, indexed: 0, skipped: 0 },
      },
      nodes: [{ id: 'subsystem:a', kind: 'subsystem', title: 'A' }],
      edges: [],
      evidence: [],
      findings: Array.from({ length: 7 }, (_, i) => ({
        id: `f${i}`,
        domain: 'architecture',
        type: 'cycle',
        detectorId: 'core/cycles',
        severity: 'high',
        title: `f${i}`,
        summary: 's',
        involvedNodeIds: ['subsystem:a'],
      })),
    })
    const out = buildOverview(buildLoadedSnapshot(snap))
    expect(out.topFindings).toHaveLength(5)
  })

  it('subsystemLayers counts only subsystem nodes and autoDetected reflects metadata', () => {
    const snap = SnapshotSchema.parse({
      meta: {
        schemaVersion: '0.1.0',
        scanId: '33333333-3333-4333-8333-333333333333',
        builtAt: '2026-05-25T00:00:00.000Z',
        projectRoot: '/abs',
        projectName: 'demo',
        vibegraphVersion: '0.0.0',
        scanDurationMs: 1,
        fileCounts: { scanned: 2, indexed: 2, skipped: 0 },
      },
      nodes: [
        {
          id: 'subsystem:server',
          kind: 'subsystem',
          title: 'Server',
          layer: 'domain',
          metadata: { autoDetected: true },
        },
        {
          id: 'subsystem:client',
          kind: 'subsystem',
          title: 'Client',
          layer: 'horizontal',
          metadata: { autoDetected: true },
        },
        { id: 'file:src/x.ts', kind: 'file', title: 'x.ts' },
        { id: 'file:src/y.ts', kind: 'file', title: 'y.ts' },
      ],
      edges: [],
      evidence: [],
      findings: [],
    })
    const out = buildOverview(buildLoadedSnapshot(snap))
    // subsystemLayers must exclude file nodes (layer:'unknown')
    expect(out.subsystemLayers).toEqual([
      { layer: 'domain', subsystemCount: 1 },
      { layer: 'horizontal', subsystemCount: 1 },
    ])
    expect(out.autoDetected).toBe(true)
  })

  it('hub ignores type-only edges (isRuntimeCouplingEdge)', () => {
    const snap = SnapshotSchema.parse({
      meta: {
        schemaVersion: '0.1.0',
        scanId: '44444444-4444-4444-8444-444444444444',
        builtAt: '2026-05-25T00:00:00.000Z',
        projectRoot: '/abs',
        projectName: 'demo',
        vibegraphVersion: '0.0.0',
        scanDurationMs: 1,
        fileCounts: { scanned: 0, indexed: 0, skipped: 0 },
      },
      nodes: [
        { id: 'subsystem:a', kind: 'subsystem', title: 'A' },
        { id: 'subsystem:b', kind: 'subsystem', title: 'B' },
      ],
      edges: [
        // purely type-only edge: typeOnlyWeight=1, runtimeWeight=0, dynamicWeight=0
        {
          id: 'e-type-only',
          from: 'subsystem:a',
          to: 'subsystem:b',
          kind: 'depends_on',
          source: 'derived',
          confidence: 'high',
          typeOnlyWeight: 1,
          runtimeWeight: 0,
          dynamicWeight: 0,
        },
      ],
      evidence: [],
      findings: [],
    })
    const out = buildOverview(buildLoadedSnapshot(snap))
    // type-only edge must NOT count toward hub fanIn
    const b = out.topHubs.find((h) => h.nodeId === 'subsystem:b')
    expect(b?.fanIn ?? 0).toBe(0)
  })
})
