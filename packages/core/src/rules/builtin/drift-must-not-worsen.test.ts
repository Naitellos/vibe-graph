import { describe, expect, it } from 'vitest'
import type { Finding } from '../../schema/finding.js'
import type { GraphBaseline } from '../../schema/graph-baseline.js'
import type { Snapshot } from '../../schema/snapshot.js'
import { buildLoadedSnapshot } from '../../snapshot/load-snapshot.js'
import { evaluateDriftMustNotWorsen } from './drift-must-not-worsen.js'
import type { BuiltinRule } from './no-new-cycles.js'

// ── Test helpers ──────────────────────────────────────────────────────────────

function makeDriftFinding(id: string, title?: string): Finding {
  return {
    id,
    domain: 'drift',
    type: 'drift-detected',
    detectorId: 'core/drift',
    severity: 'medium',
    title: title ?? `Drift in ${id}`,
    summary: `Drift detected: ${id}`,
    status: 'open',
    involvedNodeIds: [`node:${id}`],
    evidenceIds: [],
    metadata: {},
  }
}

function makeSnapshot(findings: Finding[]) {
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
    nodes: [],
    edges: [],
    evidence: [],
    findings,
  }
  return buildLoadedSnapshot(snap)
}

function makeBaseline(findings: Finding[]): GraphBaseline {
  return {
    schemaVersion: '1.0',
    snapshotId: 'baseline-snap',
    createdAt: new Date().toISOString(),
    fingerprint: 'fp-test',
    nodes: [],
    edges: [],
    findings,
  }
}

const testRule: BuiltinRule = {
  kind: 'builtin',
  id: 'drift-must-not-worsen',
  severity: 'high',
  mode: 'enforce',
  check: 'drift_must_not_worsen',
  title: 'Drift must not worsen',
  description: '',
}

// ── Tests ─────────────────────────────────────────────────────────────────────

describe('evaluateDriftMustNotWorsen', () => {
  it('no baseline → no findings (rule is no-op on first scan)', () => {
    // Even if working snapshot has drift findings, no baseline means no findings
    const snapshot = makeSnapshot([
      makeDriftFinding('drift:subsystem:a:changed-file'),
      makeDriftFinding('drift:subsystem:b:missing-file'),
    ])

    const findings = evaluateDriftMustNotWorsen(testRule, { snapshot, baseline: null })

    expect(findings).toHaveLength(0)
  })

  it('working has same drift findings as baseline → no findings (set diff empty)', () => {
    // Both baseline and working have the same two drift findings
    const driftA = makeDriftFinding('drift:subsystem:a:changed-file')
    const driftB = makeDriftFinding('drift:subsystem:b:missing-file')

    const snapshot = makeSnapshot([driftA, driftB])
    const baseline = makeBaseline([driftA, driftB])

    const findings = evaluateDriftMustNotWorsen(testRule, { snapshot, baseline })

    expect(findings).toHaveLength(0)
  })

  it('working has all baseline drift findings + 2 new ones → 2 rule findings', () => {
    // Baseline has driftA, driftB
    const driftA = makeDriftFinding('drift:subsystem:a:changed-file', 'Drift in A')
    const driftB = makeDriftFinding('drift:subsystem:b:missing-file', 'Drift in B')
    // Working adds driftC and driftD as new
    const driftC = makeDriftFinding('drift:subsystem:c:new-change', 'Drift in C')
    const driftD = makeDriftFinding('drift:subsystem:d:another-change', 'Drift in D')

    const snapshot = makeSnapshot([driftA, driftB, driftC, driftD])
    const baseline = makeBaseline([driftA, driftB])

    const findings = evaluateDriftMustNotWorsen(testRule, { snapshot, baseline })

    expect(findings).toHaveLength(2)

    const findingForC = findings.find((f) => f.metadata.driftFindingId === driftC.id)
    const findingForD = findings.find((f) => f.metadata.driftFindingId === driftD.id)

    if (findingForC === undefined) throw new Error('expected finding referencing driftC')
    if (findingForD === undefined) throw new Error('expected finding referencing driftD')

    // Validate findingForC shape
    expect(findingForC.id).toBe(`rule:${testRule.id}:${driftC.id}`)
    expect(findingForC.domain).toBe('rule')
    expect(findingForC.type).toBe('rule-violation')
    expect(findingForC.detectorId).toBe('rules-engine')
    expect(findingForC.severity).toBe('high')
    expect(findingForC.status).toBe('open')
    expect(findingForC.title).toContain(testRule.id)
    expect(findingForC.title).toContain(driftC.title)
    expect(findingForC.summary).toContain(driftC.title)
    expect(findingForC.involvedNodeIds).toEqual([...driftC.involvedNodeIds])
    expect(findingForC.evidenceIds).toEqual([])
    expect(findingForC.metadata).toMatchObject({
      ruleId: testRule.id,
      mode: testRule.mode,
      driftFindingId: driftC.id,
    })

    // Validate findingForD shape
    expect(findingForD.id).toBe(`rule:${testRule.id}:${driftD.id}`)
    expect(findingForD.metadata).toMatchObject({
      ruleId: testRule.id,
      mode: testRule.mode,
      driftFindingId: driftD.id,
    })
  })
})
