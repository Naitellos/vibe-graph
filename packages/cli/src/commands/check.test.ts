import { mkdir, mkdtemp, rm, writeFile } from 'node:fs/promises'
import { tmpdir } from 'node:os'
import { join } from 'node:path'
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import { checkCommand, runCheck } from './check.js'

// ----- shared helpers --------------------------------------------------------

/**
 * Build a Snapshot-shaped JSON with subsystems `domain` (layer: domain) and
 * `ui` (layer: horizontal). When `includeViolatingEdge` is true, also adds a
 * `depends_on` edge subsystem:domain → subsystem:ui that any
 * `from: { layer: domain }, to: { layer: horizontal }` edge-pattern rule will
 * detect.
 *
 * Note: snapshot.findings is always [] — runCheck re-evaluates rules against
 * the current config, so pre-computed rule findings are no longer trusted.
 */
function buildSnapshot(projectRoot: string, includeViolatingEdge: boolean) {
  const nodes = [
    {
      id: 'subsystem:domain',
      kind: 'subsystem' as const,
      title: 'domain',
      layer: 'domain' as const,
      status: 'unknown' as const,
      tags: [],
      files: [],
      metadata: {},
    },
    {
      id: 'subsystem:ui',
      kind: 'subsystem' as const,
      title: 'ui',
      layer: 'horizontal' as const,
      status: 'unknown' as const,
      tags: [],
      files: [],
      metadata: {},
    },
  ]
  const edges = includeViolatingEdge
    ? [
        {
          id: 'edge:domain-ui',
          from: 'subsystem:domain',
          to: 'subsystem:ui',
          kind: 'depends_on' as const,
          category: 'structural' as const,
          source: 'manual' as const,
          confidence: 'high' as const,
          evidenceIds: [],
          weight: 1,
          runtimeWeight: 0,
          typeOnlyWeight: 0,
          dynamicWeight: 0,
          metadata: {},
        },
      ]
    : []
  return {
    meta: {
      schemaVersion: '0.1.0',
      scanId: '00000000-0000-0000-0000-000000000000',
      builtAt: new Date().toISOString(),
      projectRoot,
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
}

/**
 * Write a `.vibegraph/config.yml` defining a custom edge-pattern rule
 * `custom:test` that forbids `domain → horizontal` `depends_on` edges, with
 * the given `mode`.
 */
async function seedConfigWithCustomRule(
  projectRoot: string,
  mode: 'advisory' | 'warn' | 'enforce',
): Promise<void> {
  await writeFile(
    join(projectRoot, '.vibegraph', 'config.yml'),
    [
      'project:',
      '  name: check-test',
      'subsystems:',
      '  - id: domain',
      '    title: Domain',
      '    layer: domain',
      '    match: ["src/domain/**"]',
      '  - id: ui',
      '    title: UI',
      '    layer: horizontal',
      '    match: ["src/ui/**"]',
      'rules:',
      '  - id: custom:test',
      '    kind: edge-pattern',
      '    title: Custom test rule',
      '    severity: high',
      `    mode: ${mode}`,
      '    from: { layer: domain }',
      '    to: { layer: horizontal }',
      '    relation: depends_on',
      '    forbidden: true',
      '',
    ].join('\n'),
  )
}

async function seedGraph(projectRoot: string, includeViolatingEdge: boolean): Promise<void> {
  await writeFile(
    join(projectRoot, '.vibegraph', 'cache', 'graph.json'),
    JSON.stringify(buildSnapshot(projectRoot, includeViolatingEdge)),
  )
}

// ----- tests -----------------------------------------------------------------

describe('runCheck', () => {
  let projectRoot: string

  beforeEach(async () => {
    projectRoot = await mkdtemp(join(tmpdir(), 'vg-check-'))
    await mkdir(join(projectRoot, '.vibegraph', 'cache'), { recursive: true })
  })

  afterEach(async () => {
    await rm(projectRoot, { recursive: true, force: true })
  })

  it('returns error when no graph.json exists', async () => {
    const r = await runCheck({ projectRoot })
    expect(r.status).toBe('error')
    if (r.status === 'error') expect(r.error).toContain('No graph.json')
  })

  it('returns ok with empty findings when graph has no rule-triggering edges', async () => {
    await seedGraph(projectRoot, false)
    const r = await runCheck({ projectRoot })
    expect(r.status).toBe('ok')
    if (r.status === 'ok') {
      // No user rules + no graph state that triggers built-ins (no baseline) → empty
      expect(r.ruleFindings).toEqual([])
      expect(r.exitCode).toBe(0)
    }
  })

  it('returns ok with findings + exit 0 when only advisory/warn rules fire', async () => {
    await seedConfigWithCustomRule(projectRoot, 'warn')
    await seedGraph(projectRoot, true)
    const r = await runCheck({ projectRoot })
    expect(r.status).toBe('ok')
    if (r.status === 'ok') {
      // Both our custom:test rule AND the default builtin:no-layer-violation
      // preset fire on the same domain→horizontal edge — assert custom:test is
      // present (the one we configured at warn) rather than locking the count.
      const ourFinding = r.ruleFindings.find((f) => f.metadata?.ruleId === 'custom:test')
      expect(ourFinding).toBeDefined()
      expect(ourFinding?.metadata?.mode).toBe('warn')
      // No enforce-mode finding → exit 0
      expect(r.exitCode).toBe(0)
    }
  })

  it('returns ok with exit 1 when an enforce-mode rule fires', async () => {
    await seedConfigWithCustomRule(projectRoot, 'enforce')
    await seedGraph(projectRoot, true)
    const r = await runCheck({ projectRoot })
    expect(r.status).toBe('ok')
    if (r.status === 'ok') expect(r.exitCode).toBe(1)
  })

  it('flags a rule referencing a subsystem absent from the graph as inert (not a clean pass)', async () => {
    // Rule references ghost subsystems that are NOT in the graph (graph only has
    // domain + ui). The rule can never fire, so `check` finds no violations —
    // but that "pass" is false. runCheck must surface an inert-rule warning.
    await writeFile(
      join(projectRoot, '.vibegraph', 'config.yml'),
      [
        'project:',
        '  name: check-test',
        'rules:',
        '  - id: custom:neutrality',
        '    kind: edge-pattern',
        '    title: Core neutrality',
        '    severity: high',
        '    mode: enforce',
        '    from: { subsystem: ghost-a }',
        '    to: { subsystem: ghost-b }',
        '    relation: imports',
        '    forbidden: true',
        '',
      ].join('\n'),
    )
    await seedGraph(projectRoot, false)

    const r = await runCheck({ projectRoot })
    expect(r.status).toBe('ok')
    if (r.status === 'ok') {
      // The inert rule produced no findings — a false green without the warning.
      expect(r.ruleFindings.some((f) => f.metadata?.ruleId === 'custom:neutrality')).toBe(false)
      // ...but the inert-rule warning names both unknown subsystems.
      const unknown = r.inertRules?.map((w) => w.unknownSubsystem).sort()
      expect(unknown).toEqual(['ghost-a', 'ghost-b'])
      expect(r.inertRules?.every((w) => w.ruleId === 'custom:neutrality')).toBe(true)
    }
  })

  it('--strict-rules fails the check (exit 1) when a rule is inert', async () => {
    await writeFile(
      join(projectRoot, '.vibegraph', 'config.yml'),
      [
        'project:',
        '  name: check-test',
        'rules:',
        '  - id: custom:neutrality',
        '    kind: edge-pattern',
        '    title: Core neutrality',
        '    severity: high',
        '    mode: advisory',
        '    from: { subsystem: ghost-a }',
        '    to: { subsystem: ghost-b }',
        '    relation: imports',
        '    forbidden: true',
        '',
      ].join('\n'),
    )
    await seedGraph(projectRoot, false)

    const r = await runCheck({ projectRoot, strictRules: true })
    expect(r.status).toBe('ok')
    if (r.status === 'ok') {
      // No actual violations, but strict mode escalates the inert rule to a failure.
      expect(r.ruleFindings).toEqual([])
      expect(r.strictInertFailure).toBe(true)
      expect(r.exitCode).toBe(1)
    }
  })

  it('--strict-rules does NOT fail when every rule references a real subsystem', async () => {
    // Layer-matcher rule (no subsystem id) + real subsystems in the graph → nothing inert.
    await seedConfigWithCustomRule(projectRoot, 'advisory')
    await seedGraph(projectRoot, true)

    const r = await runCheck({ projectRoot, strictRules: true })
    expect(r.status).toBe('ok')
    if (r.status === 'ok') {
      expect(r.strictInertFailure).toBeFalsy()
      expect(r.exitCode).toBe(0)
    }
  })

  it('inert rules do NOT fail the check without --strict-rules (exit 0)', async () => {
    await writeFile(
      join(projectRoot, '.vibegraph', 'config.yml'),
      [
        'project:',
        '  name: check-test',
        'rules:',
        '  - id: custom:neutrality',
        '    kind: edge-pattern',
        '    title: Core neutrality',
        '    severity: high',
        '    mode: advisory',
        '    from: { subsystem: ghost-a }',
        '    to: { subsystem: ghost-b }',
        '    relation: imports',
        '    forbidden: true',
        '',
      ].join('\n'),
    )
    await seedGraph(projectRoot, false)

    const r = await runCheck({ projectRoot })
    expect(r.status).toBe('ok')
    if (r.status === 'ok') {
      expect(r.exitCode).toBe(0)
      expect(r.strictInertFailure).toBeFalsy()
      expect(r.inertRules?.length).toBeGreaterThan(0)
    }
  })

  it('--rule filters inert-rule warnings to the selected rule id', async () => {
    await writeFile(
      join(projectRoot, '.vibegraph', 'config.yml'),
      [
        'project:',
        '  name: check-test',
        'rules:',
        '  - id: custom:neutrality',
        '    kind: edge-pattern',
        '    title: Core neutrality',
        '    severity: high',
        '    mode: advisory',
        '    from: { subsystem: ghost-a }',
        '    to: { subsystem: ghost-b }',
        '    relation: imports',
        '    forbidden: true',
        '  - id: custom:other',
        '    kind: edge-pattern',
        '    title: Other',
        '    severity: high',
        '    mode: advisory',
        '    from: { subsystem: ghost-c }',
        '    to: { layer: domain }',
        '    relation: imports',
        '    forbidden: true',
        '',
      ].join('\n'),
    )
    await seedGraph(projectRoot, false)

    const r = await runCheck({ projectRoot, rule: 'custom:neutrality' })
    expect(r.status).toBe('ok')
    if (r.status === 'ok') {
      expect(r.inertRules?.every((w) => w.ruleId === 'custom:neutrality')).toBe(true)
      expect(r.inertRules?.some((w) => w.unknownSubsystem === 'ghost-c')).toBe(false)
    }
  })
})

describe('runCheck flags', () => {
  it('--enforce treats every finding as enforce → exit 1 even for advisory rule', async () => {
    const projectRoot = await mkdtemp(join(tmpdir(), 'vg-check-'))
    try {
      await mkdir(join(projectRoot, '.vibegraph', 'cache'), { recursive: true })
      await seedConfigWithCustomRule(projectRoot, 'advisory')
      await seedGraph(projectRoot, true)
      const r = await runCheck({ projectRoot, enforce: true })
      expect(r.status).toBe('ok')
      if (r.status === 'ok') expect(r.exitCode).toBe(1)
    } finally {
      await rm(projectRoot, { recursive: true, force: true })
    }
  })

  it('--since-baseline filters out findings present in baseline', async () => {
    const projectRoot = await mkdtemp(join(tmpdir(), 'vg-check-'))
    try {
      await mkdir(join(projectRoot, '.vibegraph', 'cache'), { recursive: true })
      await seedConfigWithCustomRule(projectRoot, 'warn')
      await seedGraph(projectRoot, true)

      // Finding ids emitted by evaluateRules are `rule:${ruleId}:${edge.from}->${edge.to}`
      // per edge-pattern.ts. Both the custom rule AND the default
      // builtin:no-layer-violation fire on the same edge.
      const customRuleFindingId = 'rule:custom:test:subsystem:domain->subsystem:ui'
      const builtinFindingId = 'rule:builtin:no-layer-violation:subsystem:domain->subsystem:ui'

      // Baseline contains BOTH ids → --since-baseline filters everything out
      await writeFile(
        join(projectRoot, '.vibegraph', 'cache', 'baseline.json'),
        JSON.stringify({
          schemaVersion: '1.0',
          snapshotId: '00000000-0000-0000-0000-000000000000',
          createdAt: new Date().toISOString(),
          fingerprint: 'sha256:test',
          nodes: [],
          edges: [],
          findings: [
            {
              id: customRuleFindingId,
              domain: 'rule',
              type: 'rule-violation',
              detectorId: 'rules-engine',
              severity: 'high',
              title: 'baseline',
              summary: '',
              involvedNodeIds: ['subsystem:domain', 'subsystem:ui'],
              evidenceIds: [],
              status: 'open',
              metadata: { ruleId: 'custom:test', mode: 'warn' },
            },
            {
              id: builtinFindingId,
              domain: 'rule',
              type: 'rule-violation',
              detectorId: 'rules-engine',
              severity: 'medium',
              title: 'baseline',
              summary: '',
              involvedNodeIds: ['subsystem:domain', 'subsystem:ui'],
              evidenceIds: [],
              status: 'open',
              metadata: { ruleId: 'builtin:no-layer-violation', mode: 'advisory' },
            },
          ],
        }),
      )
      const r = await runCheck({ projectRoot, sinceBaseline: true })
      expect(r.status).toBe('ok')
      if (r.status === 'ok') expect(r.ruleFindings).toEqual([])
    } finally {
      await rm(projectRoot, { recursive: true, force: true })
    }
  })

  it('--rule filters to a single ruleId', async () => {
    const projectRoot = await mkdtemp(join(tmpdir(), 'vg-check-'))
    try {
      await mkdir(join(projectRoot, '.vibegraph', 'cache'), { recursive: true })
      // Two custom rules; both fire on the same edge. --rule narrows to one.
      await writeFile(
        join(projectRoot, '.vibegraph', 'config.yml'),
        [
          'project:',
          '  name: check-test',
          'subsystems:',
          '  - id: domain',
          '    title: Domain',
          '    layer: domain',
          '    match: ["src/domain/**"]',
          '  - id: ui',
          '    title: UI',
          '    layer: horizontal',
          '    match: ["src/ui/**"]',
          'rules:',
          '  - id: custom:test',
          '    kind: edge-pattern',
          '    title: First',
          '    severity: high',
          '    mode: warn',
          '    from: { layer: domain }',
          '    to: { layer: horizontal }',
          '    relation: depends_on',
          '    forbidden: true',
          '  - id: other',
          '    kind: edge-pattern',
          '    title: Second',
          '    severity: medium',
          '    mode: warn',
          '    from: { layer: domain }',
          '    to: { layer: horizontal }',
          '    relation: depends_on',
          '    forbidden: true',
          '',
        ].join('\n'),
      )
      await seedGraph(projectRoot, true)

      const r = await runCheck({ projectRoot, rule: 'custom:test' })
      expect(r.status).toBe('ok')
      if (r.status === 'ok') {
        expect(r.ruleFindings).toHaveLength(1)
        const only = r.ruleFindings[0]
        if (only === undefined) throw new Error('expected one finding')
        expect(only.metadata?.ruleId).toBe('custom:test')
      }
    } finally {
      await rm(projectRoot, { recursive: true, force: true })
    }
  })

  it('--mode enforce treats every finding as enforce (alias of --enforce)', async () => {
    const projectRoot = await mkdtemp(join(tmpdir(), 'vg-check-'))
    try {
      await mkdir(join(projectRoot, '.vibegraph', 'cache'), { recursive: true })
      await seedConfigWithCustomRule(projectRoot, 'warn')
      await seedGraph(projectRoot, true)
      const r = await runCheck({ projectRoot, mode: 'enforce' })
      expect(r.status).toBe('ok')
      if (r.status === 'ok') expect(r.exitCode).toBe(1)
    } finally {
      await rm(projectRoot, { recursive: true, force: true })
    }
  })

  it('--mode advisory does NOT escalate even when finding has metadata.mode=enforce', async () => {
    const projectRoot = await mkdtemp(join(tmpdir(), 'vg-check-'))
    try {
      await mkdir(join(projectRoot, '.vibegraph', 'cache'), { recursive: true })
      await seedConfigWithCustomRule(projectRoot, 'enforce')
      await seedGraph(projectRoot, true)
      const r = await runCheck({ projectRoot, mode: 'advisory' })
      expect(r.status).toBe('ok')
      if (r.status === 'ok') {
        // --mode advisory override wins over metadata.mode=enforce → exit 0
        expect(r.exitCode).toBe(0)
      }
    } finally {
      await rm(projectRoot, { recursive: true, force: true })
    }
  })
})

describe('runCheck — re-evaluates rules against current config (regression: PR #13)', () => {
  it('detects violation defined in current config even when snapshot.findings is empty (stale)', async () => {
    const projectRoot = await mkdtemp(join(tmpdir(), 'vg-check-stale-'))
    try {
      await mkdir(join(projectRoot, '.vibegraph', 'cache'), { recursive: true })

      // Same setup as the enforce test, but emphasizes the regression context:
      // snapshot.findings is explicitly empty (simulating a graph scanned BEFORE
      // the rule was added to config.yml). The fix re-evaluates the rule against
      // the current config and detects the violation.
      await seedConfigWithCustomRule(projectRoot, 'enforce')
      await seedGraph(projectRoot, true)

      const r = await runCheck({ projectRoot })

      // If runCheck trusted snapshot.findings (which is []), exitCode would be 0.
      // With the re-eval fix, the rule fires fresh and exitCode is 1.
      expect(r.status).toBe('ok')
      if (r.status !== 'ok') throw new Error('expected ok')
      expect(r.ruleFindings.length).toBeGreaterThan(0)
      expect(r.ruleFindings.some((f) => f.metadata?.ruleId === 'custom:test')).toBe(true)
      expect(r.exitCode).toBe(1)
    } finally {
      await rm(projectRoot, { recursive: true, force: true })
    }
  })
})

describe('checkCommand CLI boundary — --markdown covers early-return errors (Fix 3)', () => {
  it('--markdown --mode bogus emits the check header and dedupe marker, exits 1', async () => {
    const chunks: string[] = []
    const spy = vi.spyOn(process.stdout, 'write').mockImplementation((chunk) => {
      chunks.push(typeof chunk === 'string' ? chunk : String(chunk))
      return true
    })
    const prevCode = process.exitCode
    try {
      await checkCommand.run?.({
        args: {
          mode: 'bogus',
          markdown: true,
          json: false,
          enforce: false,
          sinceBaseline: false,
          quiet: false,
        },
        cmd: checkCommand,
      })
      const output = chunks.join('')
      expect(output).toContain('## 🔭 Vibe Graph')
      expect(output).toContain('<!-- vibe-graph-check -->')
      expect(process.exitCode).toBe(1)
    } finally {
      spy.mockRestore()
      process.exitCode = prevCode
    }
  })
})
