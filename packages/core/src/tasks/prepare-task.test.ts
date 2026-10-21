import { describe, expect, it, vi } from 'vitest'
import { TaskError } from '../errors/task-error.js'
import { SnapshotSchema, buildLoadedSnapshot } from '../index.js'
import { type PrepareTaskContext, prepareTask } from './prepare-task.js'

// ---- fixture helpers --------------------------------------------------------

/**
 * Build a snapshot where `subsystem:payments` has `n` direct dependents
 * (subsystem:dep-0 … subsystem:dep-(n-1)), each with a `depends_on` edge
 * pointing to `subsystem:payments`. Used to exercise the blast-radius risk
 * injection (dependentCount >= 5 → medium, >= 10 → high).
 */
const makeHighBlastSnap = (dependentCount: number) => {
  const depNodes = Array.from({ length: dependentCount }, (_, i) => ({
    id: `subsystem:dep-${i}`,
    kind: 'subsystem' as const,
    title: `Dep ${i}`,
    layer: 'horizontal' as const,
  }))

  const depEdges = Array.from({ length: dependentCount }, (_, i) => ({
    id: `dep-e${i}`,
    from: `subsystem:dep-${i}`,
    to: 'subsystem:payments',
    kind: 'depends_on' as const,
    source: 'derived' as const,
    confidence: 'high' as const,
    category: 'domain' as const,
    weight: 1,
  }))

  return SnapshotSchema.parse({
    meta: {
      schemaVersion: '0.1.0',
      scanId: '55555555-5555-5555-8555-555555555555',
      builtAt: '2026-05-27T00:00:00.000Z',
      projectRoot: '/tmp/prepare-task-test',
      projectName: 'test',
      vibegraphVersion: '0.0.0',
      scanDurationMs: 1,
      fileCounts: { scanned: 1, indexed: 1, skipped: 0 },
    },
    nodes: [
      { id: 'subsystem:payments', kind: 'subsystem', title: 'Payments', layer: 'domain' },
      {
        id: 'file:server/services/payment.ts',
        kind: 'file',
        title: 'payment.ts',
      },
      ...depNodes,
    ],
    edges: [
      {
        id: 'e1',
        from: 'subsystem:payments',
        to: 'file:server/services/payment.ts',
        kind: 'contains',
        source: 'derived',
        confidence: 'high',
        category: 'domain',
        weight: 1,
      },
      ...depEdges,
    ],
    evidence: [],
    findings: [],
  })
}

const makeSnap = () =>
  SnapshotSchema.parse({
    meta: {
      schemaVersion: '0.1.0',
      scanId: '44444444-4444-4444-8444-444444444444',
      builtAt: '2026-05-27T00:00:00.000Z',
      projectRoot: '/tmp/prepare-task-test',
      projectName: 'test',
      vibegraphVersion: '0.0.0',
      scanDurationMs: 1,
      fileCounts: { scanned: 3, indexed: 3, skipped: 0 },
    },
    nodes: [
      { id: 'subsystem:payments', kind: 'subsystem', title: 'Payments', layer: 'domain' },
      {
        id: 'file:server/services/payment.ts',
        kind: 'file',
        title: 'payment.ts',
      },
      { id: 'subsystem:frontend', kind: 'subsystem', title: 'Frontend', layer: 'horizontal' },
    ],
    edges: [
      {
        id: 'e1',
        from: 'subsystem:payments',
        to: 'file:server/services/payment.ts',
        kind: 'contains',
        source: 'derived',
        confidence: 'high',
        category: 'domain',
        weight: 1,
      },
      {
        id: 'e2',
        from: 'subsystem:frontend',
        to: 'subsystem:payments',
        kind: 'depends_on',
        source: 'derived',
        confidence: 'high',
        category: 'domain',
        weight: 2,
      },
    ],
    evidence: [],
    findings: [
      {
        id: 'drift:stale:subsystem:payments:subsystem:gone',
        domain: 'drift',
        type: 'stale',
        detectorId: 'core/drift',
        severity: 'medium',
        title: 'Stale dependency',
        summary: 'Declared dep no longer found in AST',
        involvedNodeIds: ['subsystem:payments'],
        status: 'open',
      },
    ],
  })

function makeLoaded() {
  return buildLoadedSnapshot(makeSnap())
}

// ---- tests ------------------------------------------------------------------

describe('prepareTask', () => {
  it('resolves target subsystem from paths via contains edges', async () => {
    const snapshot = makeLoaded()
    const result = await prepareTask(
      {
        intent: 'rewrite payments',
        paths: ['server/services/payment.ts'],
        mode: 'refactor',
      },
      { snapshot, now: new Date('2026-05-27T00:00:00.000Z') },
    )
    expect(result.target.subsystems).toContain('payments')
    expect(result.target.files).toEqual(['server/services/payment.ts'])
  })

  it('includes active drift findings as risks for target subsystem', async () => {
    const snapshot = makeLoaded()
    const result = await prepareTask(
      { intent: 'refactor', paths: ['server/services/payment.ts'], mode: 'refactor' },
      { snapshot, now: new Date('2026-05-27T00:00:00.000Z') },
    )
    expect(result.risks.length).toBeGreaterThan(0)
    expect(result.risks.some((r) => r.title.includes('Stale'))).toBe(true)
  })

  it('returns global built-in rules (no-layer-violation appears because it is globally applicable)', async () => {
    const snapshot = makeLoaded()
    const result = await prepareTask(
      { intent: 'x', paths: ['server/services/payment.ts'], mode: 'refactor' },
      { snapshot, now: new Date('2026-05-27T00:00:00.000Z') },
    )
    // All 4 default built-ins are globally applicable — rules must not be empty
    expect(result.rules.length).toBeGreaterThanOrEqual(3)
    const ruleIds = result.rules.map((r) => r.id)
    expect(ruleIds).toContain('builtin:no-layer-violation')
    // no-layer-violation is an edge-pattern with forbidden=true → appears in doNotDo
    expect(result.doNotDo.length).toBeGreaterThanOrEqual(1)
    expect(result.doNotDo.some((d) => d.includes('no-layer-violation'))).toBe(true)
  })

  it('generates a taskId matching the YYYY-MM-DD pattern', async () => {
    const snapshot = makeLoaded()
    const result = await prepareTask(
      { intent: 'x', paths: ['server/services/payment.ts'], mode: 'refactor' },
      { snapshot, now: new Date('2026-05-27T00:00:00.000Z') },
    )
    expect(result.taskId).toMatch(/^task_2026-05-27_/)
  })

  it('throws NO_MATCHING_SUBSYSTEM when paths match no subsystem', async () => {
    const snapshot = makeLoaded()
    await expect(
      prepareTask(
        { intent: 'x', paths: ['unrelated/file.ts'], mode: 'refactor' },
        { snapshot, now: new Date('2026-05-27T00:00:00.000Z') },
      ),
    ).rejects.toThrow(TaskError)
    await expect(
      prepareTask(
        { intent: 'x', paths: ['unrelated/file.ts'], mode: 'refactor' },
        { snapshot, now: new Date('2026-05-27T00:00:00.000Z') },
      ),
    ).rejects.toThrow(/NO_MATCHING_SUBSYSTEM/)
  })
})

// ---- Rules population tests -------------------------------------------------

describe('prepareTask — rules + doNotDo', () => {
  // Mock loadConfig so tests don't hit the real filesystem for config loading.
  // We import and re-export prepare-task.ts which calls loadConfig from @codearch/core.
  // Instead of mocking, we rely on the real loadConfig with /tmp/prepare-task-test
  // projectRoot — no .vibegraph/config.yml means DEFAULT_CONFIG + DEFAULT_BUILTIN_RULES.

  it('built-in no-layer-violation rule appears in output with correct shape', async () => {
    const snapshot = makeLoaded()
    const result = await prepareTask(
      {
        intent: 'rewrite payments',
        paths: ['server/services/payment.ts'],
        mode: 'refactor',
      },
      { snapshot, now: new Date('2026-05-27T00:00:00.000Z') },
    )

    const layerRule = result.rules.find((r) => r.id === 'builtin:no-layer-violation')
    expect(layerRule).toBeDefined()
    expect(layerRule?.severity).toBe('medium')
    expect(layerRule?.mode).toBe('advisory')
    expect(layerRule?.title).toBe('Domain must not depend on horizontal (UI) layer')

    // edge-pattern with forbidden=true → in doNotDo
    const doNotDoEntry = result.doNotDo.find((d) => d.includes('builtin:no-layer-violation'))
    expect(doNotDoEntry).toBeDefined()
    expect(doNotDoEntry).toContain('layer=domain')
    expect(doNotDoEntry).toContain('layer=horizontal')
    // Regression: pre-P2.04 fix the string read "Do not depends on from layer=X to layer=Y"
    // (3rd-person singular in an imperative — grammatically broken). New format uses
    // imperative-friendly phrasing.
    expect(doNotDoEntry).toMatch(/^Code in .* must not (import|depend on|call) /)
    expect(doNotDoEntry).not.toContain('Do not depends on')
  })

  it('globally-applicable built-ins (no_orphans, drift_must_not_worsen) appear in both rules and doNotDo', async () => {
    const snapshot = makeLoaded()
    const result = await prepareTask(
      { intent: 'refactor', paths: ['server/services/payment.ts'], mode: 'refactor' },
      { snapshot, now: new Date('2026-05-27T00:00:00.000Z') },
    )

    const orphanRule = result.rules.find((r) => r.id === 'builtin:no-new-orphans')
    const driftRule = result.rules.find((r) => r.id === 'builtin:drift-must-not-worsen')
    expect(orphanRule).toBeDefined()
    expect(driftRule).toBeDefined()

    expect(result.doNotDo.some((d) => d.includes('builtin:no-new-orphans'))).toBe(true)
    expect(result.doNotDo.some((d) => d.includes('builtin:drift-must-not-worsen'))).toBe(true)

    // no_cycles is NOT in doNotDo (per plan)
    expect(result.doNotDo.some((d) => d.includes('builtin:no-new-cycles'))).toBe(false)
  })

  it('user-defined edge-pattern rule for payments only appears when target is payments', async () => {
    // We need a snapshot that includes the payments subsystem with a config that
    // has a custom edge-pattern rule targeting "payments".
    // Pass overrideLoadConfig to inject rules without hitting the real filesystem.

    const mockLoadConfig = vi.fn().mockResolvedValue({
      config: {
        project: { root: '.' },
        subsystemDetection: { mode: 'auto' as const },
        subsystems: [],
        detectors: {},
        rules: [
          {
            kind: 'edge-pattern' as const,
            id: 'custom:payments-no-external',
            title: 'Payments must not be called from external',
            severity: 'high' as const,
            mode: 'enforce' as const,
            from: { subsystem: 'external' },
            to: { subsystem: 'payments' },
            relation: 'depends_on' as const,
            forbidden: true,
            description: '',
          },
          {
            kind: 'edge-pattern' as const,
            id: 'custom:other-subsystem-rule',
            title: 'Other rule',
            severity: 'low' as const,
            mode: 'advisory' as const,
            from: { subsystem: 'other' },
            to: { subsystem: 'other2' },
            relation: 'depends_on' as const,
            forbidden: true,
            description: '',
          },
        ],
      },
      subsystemDocs: [],
    })

    // Use a snapshot whose projectRoot won't exist so loadConfig would return DEFAULT_CONFIG
    // if called for real — but we pass an override to prepareTask
    const snapshot = makeLoaded()
    const result = await prepareTask(
      {
        intent: 'payment refactor',
        paths: ['server/services/payment.ts'],
        mode: 'refactor',
      },
      {
        snapshot,
        now: new Date('2026-05-27T00:00:00.000Z'),
        overrideLoadConfig: mockLoadConfig,
      },
    )

    // custom:payments-no-external targets 'payments' (in to.subsystem) → applicable
    const paymentsRule = result.rules.find((r) => r.id === 'custom:payments-no-external')
    expect(paymentsRule).toBeDefined()

    // custom:other-subsystem-rule targets 'other'/'other2' — not 'payments' → not applicable
    const otherRule = result.rules.find((r) => r.id === 'custom:other-subsystem-rule')
    expect(otherRule).toBeUndefined()
  })

  it('injects medium blast-radius risk at front of risks when dependentCount >= 5 (< 10)', async () => {
    // 5 direct dependents → dependentCount = 5 → medium severity fires
    const snapshot = buildLoadedSnapshot(makeHighBlastSnap(5))
    const result = await prepareTask(
      { intent: 'x', paths: ['server/services/payment.ts'], mode: 'refactor' },
      { snapshot, now: new Date('2026-05-27T00:00:00.000Z') },
    )

    const blastRisk = result.risks[0]
    expect(blastRisk).toBeDefined()
    expect(blastRisk?.severity).toBe('medium')
    expect(blastRisk?.title).toMatch(/blast radius/i)
    expect(blastRisk?.title).toContain('5')
    expect(blastRisk?.title).toMatch(/transitive dependents/)
    expect(blastRisk?.involvedNodeIds).toContain('subsystem:payments')
  })

  it('injects high blast-radius risk at front of risks when dependentCount >= 10', async () => {
    // 10 direct dependents → dependentCount = 10 → high severity fires
    const snapshot = buildLoadedSnapshot(makeHighBlastSnap(10))
    const result = await prepareTask(
      { intent: 'x', paths: ['server/services/payment.ts'], mode: 'refactor' },
      { snapshot, now: new Date('2026-05-27T00:00:00.000Z') },
    )

    const blastRisk = result.risks[0]
    expect(blastRisk).toBeDefined()
    expect(blastRisk?.severity).toBe('high')
    expect(blastRisk?.title).toMatch(/blast radius/i)
    expect(blastRisk?.title).toContain('10')
    expect(blastRisk?.title).toMatch(/transitive dependents/)
    expect(blastRisk?.involvedNodeIds).toContain('subsystem:payments')
  })

  it('boundary rule surfaces for any target — even non-allowedFrom potential violators', async () => {
    // Regression: a boundary rule `protectedSubsystem: vault, allowedFrom: ['vault-api']`
    // edited from `payments` (a non-allowedFrom subsystem) was NOT surfaced in prepare_task,
    // but `evaluateBoundary` would still flag a `payments → vault` edge post-edit.
    // Preflight contract requires the warning to reach the agent BEFORE the edit, so
    // boundary rules apply globally.
    const mockLoadConfig = vi.fn().mockResolvedValue({
      config: {
        project: { root: '.' },
        subsystemDetection: { mode: 'auto' as const },
        subsystems: [],
        detectors: {},
        rules: [
          {
            kind: 'boundary' as const,
            id: 'vault-locked',
            title: 'Vault accessible only via vault-api',
            severity: 'high' as const,
            mode: 'enforce' as const,
            protectedSubsystem: 'vault',
            allowedFrom: ['vault-api'],
            description: '',
          },
        ],
      },
      subsystemDocs: [],
    })

    const snapshot = makeLoaded()
    const result = await prepareTask(
      {
        // Target is `payments` (per makeLoaded) — neither vault (protected) nor vault-api.
        intent: 'payment refactor',
        paths: ['server/services/payment.ts'],
        mode: 'refactor',
      },
      {
        snapshot,
        now: new Date('2026-05-27T00:00:00.000Z'),
        overrideLoadConfig: mockLoadConfig,
      },
    )

    // The boundary rule MUST appear in rules and doNotDo even though `payments`
    // is neither the protected subsystem nor an allowedFrom member.
    const boundaryRule = result.rules.find((r) => r.id === 'vault-locked')
    expect(boundaryRule).toBeDefined()
    expect(boundaryRule?.severity).toBe('high')
    expect(boundaryRule?.mode).toBe('enforce')

    const doNotDoEntry = result.doNotDo.find((d) => d.includes('vault-locked'))
    expect(doNotDoEntry).toBeDefined()
    expect(doNotDoEntry).toContain('vault')
    expect(doNotDoEntry).toContain('vault-api')
  })
})
