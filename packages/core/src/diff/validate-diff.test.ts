import { mkdir, mkdtemp, rm, writeFile } from 'node:fs/promises'
import { tmpdir } from 'node:os'
import { join } from 'node:path'
import { describe, expect, it } from 'vitest'
import { TaskError } from '../errors/task-error.js'
import { writeGraphBaseline } from '../helpers/graph-baseline-store.js'
import { writeTaskSession } from '../helpers/task-session-store.js'
import { scan } from '../scan/scan.js'
import type { Finding } from '../schema/finding.js'
import type { GraphBaseline } from '../schema/graph-baseline.js'
import type { Snapshot } from '../schema/snapshot.js'
import { buildLoadedSnapshot } from '../snapshot/load-snapshot.js'
import {
  computeDelta,
  loadAndValidateTaskSession,
  summariseStatus,
  validateDiff,
} from './validate-diff.js'
import type { WorkingGraph } from './working-graph.js'

// ---------------------------------------------------------------------------
// Fixtures — adjusted to match FindingSchema (requires type, detectorId, summary)
// and EdgeSchema (requires kind from EdgeKindSchema, source, confidence, category).
// ---------------------------------------------------------------------------

const snap: Snapshot = {
  meta: {
    schemaVersion: '0.1.0',
    scanId: '00000000-0000-0000-0000-000000000001',
    builtAt: '2024-01-01T00:00:00.000Z',
    projectRoot: '/tmp/none',
    projectName: 't',
    vibegraphVersion: '0.0.0',
    scanDurationMs: 0,
    fileCounts: { scanned: 0, indexed: 0, skipped: 0 },
  },
  nodes: [
    {
      id: 'subsystem:core',
      kind: 'subsystem',
      title: 'core',
      layer: 'domain',
      status: 'unknown',
      tags: [],
      files: [],
      metadata: {},
    },
  ],
  edges: [],
  evidence: [],
  findings: [],
}

const blankBaseline: GraphBaseline = {
  schemaVersion: '1.0',
  snapshotId: 'scan_baseline',
  createdAt: '2026-05-27T00:00:00.000Z',
  fingerprint: 'sha256:base',
  nodes: [],
  edges: [],
  findings: [],
}

function makeFinding(overrides: Partial<Finding> = {}): Finding {
  return {
    id: 'finding:1',
    domain: 'architecture',
    type: 'cycle',
    detectorId: 'core-cycles',
    severity: 'medium',
    title: 'Finding',
    summary: 'Finding summary',
    status: 'open',
    involvedNodeIds: ['x'],
    evidenceIds: [],
    metadata: {},
    ...overrides,
  }
}

describe('validateDiff', () => {
  // Behavior-preserving: the extracted orchestration THROWS NO_BASELINE when no
  // baseline exists at projectRoot (matching the original MCP handler, which
  // raised ToolError('NO_BASELINE', ...)). Core throws TaskError; the MCP
  // wrapper maps it back to ToolError.
  it('throws NO_BASELINE when no baseline exists at projectRoot', async () => {
    const snapshot = buildLoadedSnapshot(snap)
    await expect(
      validateDiff({ workingFiles: [], mode: 'advisory' }, { snapshot, projectRoot: '/tmp/none' }),
    ).rejects.toMatchObject({ code: 'NO_BASELINE' })
    await expect(
      validateDiff({ workingFiles: [], mode: 'advisory' }, { snapshot, projectRoot: '/tmp/none' }),
    ).rejects.toBeInstanceOf(TaskError)
  })
})

describe('computeDelta', () => {
  it('returns no deltas for identical graphs', () => {
    const working: WorkingGraph = { nodes: [], edges: [], findings: [] }
    const delta = computeDelta(blankBaseline, working)
    expect(delta.newFindings).toEqual([])
    expect(delta.removedFindings).toEqual([])
    expect(delta.graphDelta.newEdges).toEqual([])
    expect(delta.graphDelta.removedEdges).toEqual([])
  })

  it('detects new finding in working graph', () => {
    const working: WorkingGraph = {
      nodes: [],
      edges: [],
      findings: [
        {
          id: 'cycle:1',
          domain: 'architecture',
          type: 'cycle',
          detectorId: 'core-cycles',
          severity: 'high',
          title: 'New cycle',
          summary: 'Circular dependency detected',
          status: 'open',
          involvedNodeIds: ['x', 'y'],
          evidenceIds: [],
          metadata: {},
        },
      ],
    }
    const delta = computeDelta(blankBaseline, working)
    expect(delta.newFindings.length).toBe(1)
    expect(delta.newFindings[0].id).toBe('cycle:1')
  })

  it('detects removed finding from baseline', () => {
    const baseline: GraphBaseline = {
      ...blankBaseline,
      findings: [makeFinding({ id: 'cycle:1', severity: 'high', title: 'Cycle' })],
    }
    const working: WorkingGraph = { nodes: [], edges: [], findings: [] }
    const delta = computeDelta(baseline, working)
    expect(delta.removedFindings.length).toBe(1)
    expect(delta.newFindings).toEqual([])
  })

  it('treats same-id severity increases as new/worsened findings', () => {
    const baseline: GraphBaseline = {
      ...blankBaseline,
      findings: [makeFinding({ id: 'fanout:payments', severity: 'medium' })],
    }
    const working: WorkingGraph = {
      nodes: [],
      edges: [],
      findings: [makeFinding({ id: 'fanout:payments', severity: 'high' })],
    }
    const delta = computeDelta(baseline, working)
    expect(delta.newFindings.map((f) => f.id)).toEqual(['fanout:payments'])
    expect(delta.removedFindings).toEqual([])
  })

  it('treats same-id accepted to open status changes as new/worsened findings', () => {
    const baseline: GraphBaseline = {
      ...blankBaseline,
      findings: [makeFinding({ id: 'drift:1', domain: 'drift', status: 'accepted' })],
    }
    const working: WorkingGraph = {
      nodes: [],
      edges: [],
      findings: [makeFinding({ id: 'drift:1', domain: 'drift', status: 'open' })],
    }
    const delta = computeDelta(baseline, working)
    expect(delta.newFindings.map((f) => f.id)).toEqual(['drift:1'])
  })

  it('detects new edge added in working graph', () => {
    const working: WorkingGraph = {
      nodes: [],
      edges: [
        {
          id: 'e_new',
          from: 'a',
          to: 'b',
          kind: 'depends_on',
          source: 'derived',
          confidence: 'high',
          category: 'domain',
          weight: 1,
          runtimeWeight: 0,
          typeOnlyWeight: 0,
          dynamicWeight: 0,
          evidenceIds: [],
          metadata: {},
        },
      ],
      findings: [],
    }
    const delta = computeDelta(blankBaseline, working)
    expect(delta.graphDelta.newEdges.length).toBe(1)
  })
})

describe('loadAndValidateTaskSession', () => {
  it('loads a task session whose baseline matches the current baseline', async () => {
    const projectRoot = await mkdtemp(join(tmpdir(), 'vg-vd-session-'))
    try {
      await writeTaskSession(projectRoot, {
        taskId: 'task_2026-05-27_abcd1234',
        intent: 'refactor',
        paths: ['src/a.ts'],
        mode: 'refactor',
        baselineSnapshotId: blankBaseline.snapshotId,
        createdAt: '2026-05-27T00:00:00.000Z',
      })

      const session = await loadAndValidateTaskSession({
        projectRoot,
        taskId: 'task_2026-05-27_abcd1234',
        baseline: blankBaseline,
      })

      expect(session?.taskId).toBe('task_2026-05-27_abcd1234')
    } finally {
      await rm(projectRoot, { recursive: true, force: true })
    }
  })

  it('throws INVALID_INPUT when taskId has no persisted prepare_task session', async () => {
    const projectRoot = await mkdtemp(join(tmpdir(), 'vg-vd-session-missing-'))
    try {
      await expect(
        loadAndValidateTaskSession({
          projectRoot,
          taskId: 'task_2026-05-27_missing',
          baseline: blankBaseline,
        }),
      ).rejects.toMatchObject({ code: 'INVALID_INPUT' })
    } finally {
      await rm(projectRoot, { recursive: true, force: true })
    }
  })

  it('throws SNAPSHOT_STALE when task session baseline differs from current baseline', async () => {
    const projectRoot = await mkdtemp(join(tmpdir(), 'vg-vd-session-stale-'))
    try {
      await writeTaskSession(projectRoot, {
        taskId: 'task_2026-05-27_abcd1234',
        intent: 'refactor',
        paths: ['src/a.ts'],
        mode: 'refactor',
        baselineSnapshotId: 'scan_old',
        createdAt: '2026-05-27T00:00:00.000Z',
      })

      await expect(
        loadAndValidateTaskSession({
          projectRoot,
          taskId: 'task_2026-05-27_abcd1234',
          baseline: blankBaseline,
        }),
      ).rejects.toMatchObject({ code: 'SNAPSHOT_STALE' })
    } finally {
      await rm(projectRoot, { recursive: true, force: true })
    }
  })
})

describe('summariseStatus', () => {
  it('returns ok when no new findings', () => {
    expect(
      summariseStatus({
        newFindings: [],
        newViolations: [],
        mode: 'advisory',
      }),
    ).toBe('ok')
  })

  it('returns warn for medium new findings', () => {
    expect(
      summariseStatus({
        newFindings: [
          {
            id: 'x',
            domain: 'drift',
            type: 'orphan',
            detectorId: 'core-drift',
            severity: 'medium',
            title: 't',
            summary: '',
            status: 'open',
            involvedNodeIds: [],
            evidenceIds: [],
            metadata: {},
          },
        ],
        newViolations: [],
        mode: 'advisory',
      }),
    ).toBe('warn')
  })

  it('returns violation for high-severity new finding', () => {
    expect(
      summariseStatus({
        newFindings: [
          {
            id: 'x',
            domain: 'architecture',
            type: 'cycle',
            detectorId: 'core-cycles',
            severity: 'high',
            title: 't',
            summary: '',
            status: 'open',
            involvedNodeIds: [],
            evidenceIds: [],
            metadata: {},
          },
        ],
        newViolations: [],
        mode: 'advisory',
      }),
    ).toBe('violation')
  })

  // --- Task 10: mode-aware summariseStatus tests ---

  it('advisory rule violation (metadata.mode=advisory) does not escalate status → ok', () => {
    // Per-rule mode wins: metadata.mode='advisory' means this violation never
    // contributes to status, even if newViolations is populated.
    const advisoryViolation = makeFinding({
      id: 'rule:no-layer-violation:1',
      domain: 'rule',
      type: 'rule-violation',
      detectorId: 'no-layer-violation',
      severity: 'high',
      metadata: { mode: 'advisory' },
    })
    expect(
      summariseStatus({
        newFindings: [],
        newViolations: [advisoryViolation],
        mode: 'advisory',
      }),
    ).toBe('ok')
  })

  it('warn rule violation (metadata.mode=warn) escalates to warn regardless of input mode=enforce', () => {
    // Per-rule mode wins: metadata.mode='warn' caps escalation at 'warn',
    // even when input mode='enforce'.
    const warnViolation = makeFinding({
      id: 'rule:no-layer-violation:2',
      domain: 'rule',
      type: 'rule-violation',
      detectorId: 'no-layer-violation',
      severity: 'medium',
      metadata: { mode: 'warn' },
    })
    expect(
      summariseStatus({
        newFindings: [],
        newViolations: [warnViolation],
        mode: 'enforce',
      }),
    ).toBe('warn')
  })

  it('enforce rule violation (metadata.mode=enforce) always escalates to violation', () => {
    // Per-rule mode wins: metadata.mode='enforce' always triggers 'violation'.
    const enforceViolation = makeFinding({
      id: 'rule:no-layer-violation:3',
      domain: 'rule',
      type: 'rule-violation',
      detectorId: 'no-layer-violation',
      severity: 'low',
      metadata: { mode: 'enforce' },
    })
    expect(
      summariseStatus({
        newFindings: [],
        newViolations: [enforceViolation],
        mode: 'advisory',
      }),
    ).toBe('violation')
  })

  it('rule violation without metadata.mode uses input mode as fallback', () => {
    // No per-rule mode set → falls back to input mode.
    // input mode='warn' → status='warn'
    const noMetaModeViolation = makeFinding({
      id: 'rule:no-orphans:1',
      domain: 'rule',
      type: 'rule-violation',
      detectorId: 'no-new-orphans',
      severity: 'medium',
      metadata: {},
    })
    expect(
      summariseStatus({
        newFindings: [],
        newViolations: [noMetaModeViolation],
        mode: 'warn',
      }),
    ).toBe('warn')
  })

  it('rule violation without metadata.mode falls back to enforce input mode → violation', () => {
    const noMetaModeViolation = makeFinding({
      id: 'rule:no-orphans:2',
      domain: 'rule',
      type: 'rule-violation',
      detectorId: 'no-new-orphans',
      severity: 'medium',
      metadata: {},
    })
    expect(
      summariseStatus({
        newFindings: [],
        newViolations: [noMetaModeViolation],
        mode: 'enforce',
      }),
    ).toBe('violation')
  })
})

// ---------------------------------------------------------------------------
// Integration: validateDiff wires new-coupling findings + conformance
//
// Approach: spin up a minimal on-disk project with two subsystems (alpha/beta)
// where the baseline has NO cross-subsystem edge, then add a runtime import from
// alpha → beta in the working tree and call validateDiff with workingFiles.
// The scanner will detect the new import edge; collectNewCoupling + buildConformance
// surface it through the full validateDiff path.
// ---------------------------------------------------------------------------

// ---------------------------------------------------------------------------
// Fix 1 regression: NEW file (not in baseline) importing across a subsystem
// boundary MUST emit new-coupling.
//
// The bug: computeAffectedNodeIds only read baseline `contains` edges.  A newly
// added file has NO baseline `contains` edge, so its owning subsystem was never
// added to affectedNodeIds, and collectNewCoupling silently dropped the new
// subsystem→subsystem edge.
//
// The fix: pass [...baseline.edges, ...working.edges] so the working scan's
// `contains` edges supply ownership for newly-added files.
// ---------------------------------------------------------------------------
describe('validateDiff — new-coupling for a file NOT in baseline (Fix 1)', () => {
  it('emits new-coupling when a NEWLY ADDED file (absent from baseline) imports across subsystem boundary', async () => {
    const projectRoot = await mkdtemp(join(tmpdir(), 'vg-vd-newfile-coupling-'))
    try {
      await mkdir(join(projectRoot, 'src', 'alpha'), { recursive: true })
      await mkdir(join(projectRoot, 'src', 'beta'), { recursive: true })
      await mkdir(join(projectRoot, '.vibegraph', 'subsystems'), { recursive: true })

      await writeFile(
        join(projectRoot, 'package.json'),
        JSON.stringify({ name: 'newfile-coupling-test', version: '0.0.0', dependencies: {} }),
        'utf-8',
      )
      await writeFile(
        join(projectRoot, 'tsconfig.json'),
        JSON.stringify({
          compilerOptions: {
            strict: true,
            target: 'ES2022',
            module: 'NodeNext',
            moduleResolution: 'NodeNext',
            noEmit: true,
          },
          include: ['src/**/*'],
        }),
        'utf-8',
      )

      // beta: standalone
      await writeFile(
        join(projectRoot, 'src', 'beta', 'index.ts'),
        'export const beta = 42\n',
        'utf-8',
      )

      // alpha/new-file.ts: NEW file (not in baseline at all) that imports beta
      await writeFile(
        join(projectRoot, 'src', 'alpha', 'new-file.ts'),
        "import { beta } from '../beta/index.js'\nexport const thing = beta\n",
        'utf-8',
      )

      await writeFile(
        join(projectRoot, '.vibegraph', 'subsystems', 'alpha.yml'),
        'id: alpha\ntitle: Alpha\nlayer: domain\nmatch:\n  - src/alpha/**\n',
        'utf-8',
      )
      await writeFile(
        join(projectRoot, '.vibegraph', 'subsystems', 'beta.yml'),
        'id: beta\ntitle: Beta\nlayer: domain\nmatch:\n  - src/beta/**\n',
        'utf-8',
      )

      // Baseline: has subsystem nodes + contains edge for beta, but NO contains
      // edge for src/alpha/new-file.ts (it's brand-new and was never in baseline).
      const baseline: GraphBaseline = {
        schemaVersion: '1.0',
        snapshotId: 'scan_newfile_base',
        createdAt: '2026-01-01T00:00:00.000Z',
        fingerprint: 'sha256:newfile-base',
        nodes: [
          {
            id: 'subsystem:alpha',
            kind: 'subsystem',
            title: 'Alpha',
            layer: 'domain',
            status: 'unknown',
            tags: [],
            files: [],
            metadata: {},
          },
          {
            id: 'subsystem:beta',
            kind: 'subsystem',
            title: 'Beta',
            layer: 'domain',
            status: 'unknown',
            tags: [],
            files: [],
            metadata: {},
          },
        ],
        edges: [
          // beta's existing file is in baseline — but alpha/new-file.ts is NOT
          {
            id: 'e_contains_beta',
            from: 'subsystem:beta',
            to: 'file:src/beta/index.ts',
            kind: 'contains',
            source: 'derived',
            confidence: 'high',
            category: 'domain',
            weight: 1,
            runtimeWeight: 0,
            typeOnlyWeight: 0,
            dynamicWeight: 0,
            evidenceIds: [],
            metadata: {},
          },
        ],
        findings: [],
      }
      await writeGraphBaseline(projectRoot, baseline)

      const snapshot = buildLoadedSnapshot(snap)

      // Pass the new file as a changed file — this is the "diff" being validated
      const out = await validateDiff(
        { workingFiles: ['src/alpha/new-file.ts'], mode: 'advisory' },
        { snapshot, projectRoot },
      )

      // Fix 1 assertion: the new-file under alpha MUST produce a coupling finding
      // because alpha now depends on beta (a NEW cross-subsystem edge).
      // In curated mode (subsystem YAMLs present) the drift detector emits an
      // `undeclared` finding which replaces the synthetic `new-coupling`.
      expect(
        out.newFindings.some((f) => f.type === 'new-coupling' || f.type === 'undeclared'),
      ).toBe(true)
      expect(out.conformance?.byKind.coupling).toBeGreaterThanOrEqual(1)
      // Fix 3 assertion: summary must count the synthetic finding (not 0)
      expect(out.summary).toMatch(/^[1-9]\d* new/)
    } finally {
      await rm(projectRoot, { recursive: true, force: true })
    }
  }, 30_000)
})

describe('validateDiff — new-coupling + conformance wiring', () => {
  it('emits new-coupling finding and conformance when a new cross-subsystem runtime edge appears', async () => {
    const projectRoot = await mkdtemp(join(tmpdir(), 'vg-vd-coupling-'))
    try {
      // 1. Set up the project layout:
      //    src/alpha/index.ts  — exports a value (no import of beta in BASELINE)
      //    src/beta/index.ts   — exports a value
      //    .vibegraph/subsystems/alpha.yml — owns src/alpha
      //    .vibegraph/subsystems/beta.yml  — owns src/beta
      //    package.json + tsconfig.json    — minimal, so scan() can parse TS
      await mkdir(join(projectRoot, 'src', 'alpha'), { recursive: true })
      await mkdir(join(projectRoot, 'src', 'beta'), { recursive: true })
      await mkdir(join(projectRoot, '.vibegraph', 'subsystems'), { recursive: true })

      await writeFile(
        join(projectRoot, 'package.json'),
        JSON.stringify({ name: 'coupling-test', version: '0.0.0', dependencies: {} }),
        'utf-8',
      )
      await writeFile(
        join(projectRoot, 'tsconfig.json'),
        JSON.stringify({
          compilerOptions: {
            strict: true,
            target: 'ES2022',
            module: 'NodeNext',
            moduleResolution: 'NodeNext',
            noEmit: true,
          },
          include: ['src/**/*'],
        }),
        'utf-8',
      )

      // beta: standalone
      await writeFile(
        join(projectRoot, 'src', 'beta', 'index.ts'),
        'export const beta = 42\n',
        'utf-8',
      )

      // alpha: imports beta — this is the NEW runtime import that wasn't in the baseline
      await writeFile(
        join(projectRoot, 'src', 'alpha', 'index.ts'),
        "import { beta } from '../beta/index.js'\nexport const alpha = beta\n",
        'utf-8',
      )

      // Subsystem YAML definitions — use glob patterns so picomatch matches files
      await writeFile(
        join(projectRoot, '.vibegraph', 'subsystems', 'alpha.yml'),
        'id: alpha\ntitle: Alpha\nlayer: domain\nmatch:\n  - src/alpha/**\n',
        'utf-8',
      )
      await writeFile(
        join(projectRoot, '.vibegraph', 'subsystems', 'beta.yml'),
        'id: beta\ntitle: Beta\nlayer: domain\nmatch:\n  - src/beta/**\n',
        'utf-8',
      )

      // 2. Write a baseline with the two subsystem NODES but NO cross-subsystem edge.
      //    This simulates "state before the change": alpha and beta existed independently.
      const baseline: GraphBaseline = {
        schemaVersion: '1.0',
        snapshotId: 'scan_coupling_base',
        createdAt: '2026-01-01T00:00:00.000Z',
        fingerprint: 'sha256:coupling-base',
        nodes: [
          {
            id: 'subsystem:alpha',
            kind: 'subsystem',
            title: 'Alpha',
            layer: 'domain',
            status: 'unknown',
            tags: [],
            files: [],
            metadata: {},
          },
          {
            id: 'subsystem:beta',
            kind: 'subsystem',
            title: 'Beta',
            layer: 'domain',
            status: 'unknown',
            tags: [],
            files: [],
            metadata: {},
          },
        ],
        edges: [],
        findings: [],
      }
      await writeGraphBaseline(projectRoot, baseline)

      // 3. The snapshot passed to validateDiff is unused by the orchestrator
      //    (it reads baseline from disk + scans working tree). Pass a minimal one.
      const snapshot = buildLoadedSnapshot(snap)

      // 4. Call validateDiff — workingFiles includes the alpha file that now imports beta.
      //    affectedNodeIds will include file:src/alpha/index.ts.
      //    The baseline has no `contains` edges, so subsystem:alpha won't be in
      //    affectedNodeIds via the `contains` path — but collectNewCoupling checks
      //    affectedNodeIds.has(e.from) || affectedNodeIds.has(e.to) on subsystem nodes.
      //    We therefore also need the baseline `contains` edges so computeAffectedNodeIds
      //    maps file:src/alpha/index.ts → subsystem:alpha. Add them to the baseline.
      const baselineWithContains: GraphBaseline = {
        ...baseline,
        edges: [
          {
            id: 'e_contains_alpha',
            from: 'subsystem:alpha',
            to: 'file:src/alpha/index.ts',
            kind: 'contains',
            source: 'derived',
            confidence: 'high',
            category: 'domain',
            weight: 1,
            runtimeWeight: 0,
            typeOnlyWeight: 0,
            dynamicWeight: 0,
            evidenceIds: [],
            metadata: {},
          },
          {
            id: 'e_contains_beta',
            from: 'subsystem:beta',
            to: 'file:src/beta/index.ts',
            kind: 'contains',
            source: 'derived',
            confidence: 'high',
            category: 'domain',
            weight: 1,
            runtimeWeight: 0,
            typeOnlyWeight: 0,
            dynamicWeight: 0,
            evidenceIds: [],
            metadata: {},
          },
        ],
      }
      await writeGraphBaseline(projectRoot, baselineWithContains)

      const out = await validateDiff(
        { workingFiles: ['src/alpha/index.ts'], mode: 'advisory' },
        { snapshot, projectRoot },
      )

      // Core assertions: a cross-subsystem coupling signal is surfaced, conformance
      // is built, and status is warn (low severity → never violation).
      // In curated mode (subsystem YAMLs present) the drift detector emits an
      // `undeclared` finding which replaces the synthetic `new-coupling` to avoid
      // duplication. Accept either type as a valid coupling signal.
      expect(
        out.newFindings.some((f) => f.type === 'new-coupling' || f.type === 'undeclared'),
      ).toBe(true)
      expect(out.conformance?.byKind.coupling).toBeGreaterThanOrEqual(1)
      expect(out.conformance?.headline).toContain('cross-subsystem link')
      expect(out.status).toBe('warn')
    } finally {
      await rm(projectRoot, { recursive: true, force: true })
    }
  }, 30_000)
})

describe('validateDiff — task-scoped output', () => {
  it('omits unrelated baseline drift, preserves taskId, and warns about files outside prepare_task', async () => {
    const projectRoot = await mkdtemp(join(tmpdir(), 'vg-vd-task-scope-'))
    try {
      await mkdir(join(projectRoot, 'src', 'alpha'), { recursive: true })
      await mkdir(join(projectRoot, 'src', 'beta'), { recursive: true })
      await mkdir(join(projectRoot, '.vibegraph', 'subsystems'), { recursive: true })
      await writeFile(
        join(projectRoot, 'package.json'),
        JSON.stringify({ name: 'task-scope-test', version: '0.0.0', dependencies: {} }),
        'utf-8',
      )
      await writeFile(
        join(projectRoot, 'tsconfig.json'),
        JSON.stringify({
          compilerOptions: {
            strict: true,
            target: 'ES2022',
            module: 'NodeNext',
            moduleResolution: 'NodeNext',
            noEmit: true,
          },
          include: ['src/**/*'],
        }),
        'utf-8',
      )
      await writeFile(join(projectRoot, 'src', 'alpha', 'index.ts'), 'export const alpha = 1\n')
      await writeFile(join(projectRoot, 'src', 'alpha', 'stale.ts'), 'export const stale = 3\n')
      await writeFile(join(projectRoot, 'src', 'beta', 'index.ts'), 'export const beta = 2\n')
      await writeFile(
        join(projectRoot, '.vibegraph', 'subsystems', 'alpha.yml'),
        'id: alpha\ntitle: Alpha\nlayer: domain\nmatch:\n  - src/alpha/**\n',
      )
      await writeFile(
        join(projectRoot, '.vibegraph', 'subsystems', 'beta.yml'),
        'id: beta\ntitle: Beta\nlayer: domain\nmatch:\n  - src/beta/**\n',
      )

      const current = await scan({ root: projectRoot })
      const betaFileId = 'file:src/beta/index.ts'
      const staleFileId = 'file:src/alpha/stale.ts'
      expect(current.nodes.some((node) => node.id === betaFileId)).toBe(true)
      expect(current.nodes.some((node) => node.id === staleFileId)).toBe(true)

      // Simulate an old baseline with unrelated drift in both directions:
      // beta's file and a sibling in alpha are missing from it, while a legacy
      // subsystem no longer exists. The sibling proves that subsystem-level
      // scoping does not leak unrelated drift from the same large subsystem.
      const baseline: GraphBaseline = {
        schemaVersion: '1.0',
        snapshotId: 'scan_task_scope_base',
        createdAt: '2026-07-24T00:00:00.000Z',
        fingerprint: 'sha256:task-scope-base',
        nodes: [
          ...current.nodes.filter((node) => node.id !== betaFileId && node.id !== staleFileId),
          {
            id: 'subsystem:legacy',
            kind: 'subsystem',
            title: 'Legacy',
            layer: 'domain',
            status: 'unknown',
            tags: [],
            files: [],
            metadata: {},
          },
        ],
        edges: current.edges.filter(
          (edge) =>
            edge.from !== betaFileId &&
            edge.to !== betaFileId &&
            edge.from !== staleFileId &&
            edge.to !== staleFileId,
        ),
        findings: current.findings,
      }
      await writeGraphBaseline(projectRoot, baseline)

      const taskId = 'task_2026-07-24_fd2fb03e'
      await writeTaskSession(projectRoot, {
        taskId,
        intent: 'edit beta only',
        paths: ['src/beta/index.ts'],
        mode: 'refactor',
        baselineSnapshotId: baseline.snapshotId,
        createdAt: '2026-07-24T00:01:00.000Z',
      })

      const out = await validateDiff(
        { taskId, workingFiles: ['./src/alpha/index.ts'], mode: 'advisory' },
        { snapshot: buildLoadedSnapshot(snap), projectRoot },
      )

      expect(out.taskId).toBe(taskId)
      expect(out.status).toBe('warn')
      expect(out.scope).toMatchObject({
        taskLinked: true,
        plannedFiles: ['src/beta/index.ts'],
        changedFiles: ['src/alpha/index.ts'],
        deletedFiles: [],
        outOfScopeFiles: ['src/alpha/index.ts'],
      })
      expect(out.graphDelta).toEqual({
        newEdges: [],
        removedEdges: [],
        newNodes: [],
        removedNodes: [],
      })
      expect(out.scope.omittedGraphDelta.newNodes).toBeGreaterThan(0)
      expect(out.scope.omittedGraphDelta.removedNodes).toBeGreaterThan(0)
      expect(out.summary).toBe(
        '0 new/worsened finding(s), 0 resolved, 0 new edge(s) within 1 changed file(s).',
      )
      expect(out.recommendations).toEqual(
        expect.arrayContaining([
          expect.stringContaining('not declared by prepare_task'),
          expect.stringContaining('validate_drift'),
        ]),
      )
    } finally {
      await rm(projectRoot, { recursive: true, force: true })
    }
  }, 30_000)
})
