import { existsSync } from 'node:fs'
import { mkdir, mkdtemp, rm, writeFile } from 'node:fs/promises'
import { tmpdir } from 'node:os'
import { join } from 'node:path'
import { computeFindingsDelta } from '@codearch/core'
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import {
  computeVerdict,
  resolveExitCode,
  runValidateDiff,
  validateDiffCommand,
} from './validate-diff.js'

describe('runValidateDiff', () => {
  let projectRoot: string

  beforeEach(async () => {
    projectRoot = await mkdtemp(join(tmpdir(), 'vg-vd-'))
    await mkdir(join(projectRoot, '.vibegraph', 'cache'), { recursive: true })
  })

  afterEach(async () => {
    await rm(projectRoot, { recursive: true, force: true })
  })

  it('returns error when no baseline exists', async () => {
    const r = await runValidateDiff({ projectRoot, workingFiles: [] })
    expect(r.status).toBe('error')
    if (r.status === 'error') expect(r.error).toContain('NO_BASELINE')
  })

  it('returns ok verdict when working has no new findings vs baseline', async () => {
    // Baseline with one finding; explicit empty workingFiles → buildWorkingGraph
    // gets nothing to scan → working.findings is empty → no new findings.
    // But baseline has 1 finding → it's "removed" relative to working. Verdict 'ok'
    // because no NEW violations or high-severity findings.
    await writeFile(
      join(projectRoot, '.vibegraph', 'cache', 'baseline.json'),
      JSON.stringify(minimalBaseline(projectRoot, [])),
    )
    const r = await runValidateDiff({ projectRoot, workingFiles: [] })
    expect(r.status).toBe('ok')
    if (r.status === 'ok') {
      expect(r.verdict).toBe('ok')
      expect(r.exitCode).toBe(0)
      expect(r.newViolations).toEqual([])
    }
  })

  it('verdict is ok when baseline has an enforce violation that is now resolved (removed from working)', async () => {
    // Baseline empty. Working will have the rule finding (we'd need scan integration
    // to truly produce this, but we can test the delta+split logic by pre-writing
    // a graph.json that buildWorkingGraph reads as the source-of-truth for findings).
    //
    // ACTUALLY: buildWorkingGraph builds a fresh graph by parsing changed files,
    // not by reading graph.json. So we can't easily inject findings.
    //
    // For Task 3, focus on the no-finding paths. Task 8's E2E test exercises the
    // full pipeline (real scan that emits rule findings via Stage 4.6).
    //
    // Test the delta logic via a baseline that contains a finding, plus
    // workingFiles: [] → working has no findings → that baseline finding goes
    // to removedFindings. Verdict 'ok' because removed-violations don't escalate.
    const baselineFinding = ruleFinding('enforce', 'rule:baseline:1', 'old')
    await writeFile(
      join(projectRoot, '.vibegraph', 'cache', 'baseline.json'),
      JSON.stringify(minimalBaseline(projectRoot, [baselineFinding])),
    )
    const r = await runValidateDiff({ projectRoot, workingFiles: [] })
    expect(r.status).toBe('ok')
    if (r.status === 'ok') {
      expect(r.verdict).toBe('ok') // baseline had the violation; removing it is good
      expect(r.removedViolations).toHaveLength(1)
      expect(r.newViolations).toEqual([])
    }
  })

  it('explicit workingFiles override bypasses git diff resolution', async () => {
    await writeFile(
      join(projectRoot, '.vibegraph', 'cache', 'baseline.json'),
      JSON.stringify(minimalBaseline(projectRoot, [])),
    )
    // Passing workingFiles: [] means git is never invoked.
    const r = await runValidateDiff({ projectRoot, workingFiles: [] })
    expect(r.status).toBe('ok')
  })
})

describe('computeFindingsDelta (re-exported from @codearch/core)', () => {
  it('treats a worsened finding (severity low → high, same id) as new', () => {
    const baseline = [ruleFinding('enforce', 'finding:1', 'original', 'low')]
    const working = [ruleFinding('enforce', 'finding:1', 'worsened', 'high')]
    const { newFindings, removedFindings } = computeFindingsDelta(baseline, working)
    expect(newFindings).toHaveLength(1)
    expect(newFindings[0]?.id).toBe('finding:1')
    expect(newFindings[0]?.severity).toBe('high')
    // The worsened finding replaces the old one, so removedFindings should be empty
    // (the id still exists in working — it's worsened, not removed).
    expect(removedFindings).toHaveLength(0)
  })

  it('does not treat an unchanged finding as new', () => {
    const finding = ruleFinding('enforce', 'finding:2', 'stable', 'medium')
    const { newFindings } = computeFindingsDelta([finding], [finding])
    expect(newFindings).toHaveLength(0)
  })

  it('treats a genuinely new finding (id absent in baseline) as new', () => {
    const { newFindings, removedFindings } = computeFindingsDelta(
      [],
      [ruleFinding('enforce', 'finding:3', 'brand-new', 'high')],
    )
    expect(newFindings).toHaveLength(1)
    expect(removedFindings).toHaveLength(0)
  })
})

describe('runValidateDiff flags', () => {
  it('--enforce treats every newViolation as enforce → verdict ok when no violations', async () => {
    const projectRoot = await mkdtemp(join(tmpdir(), 'vg-vd-'))
    try {
      await mkdir(join(projectRoot, '.vibegraph', 'cache'), { recursive: true })
      await writeFile(
        join(projectRoot, '.vibegraph', 'cache', 'baseline.json'),
        JSON.stringify(minimalBaseline(projectRoot, [])),
      )
      const r = await runValidateDiff({ projectRoot, workingFiles: [], enforce: true })
      expect(r.status).toBe('ok')
      // No findings, no violations → still ok
      if (r.status === 'ok') expect(r.verdict).toBe('ok')
    } finally {
      await rm(projectRoot, { recursive: true, force: true })
    }
  })

  it('--mode advisory does not escalate when newViolations have metadata.mode=enforce', () => {
    // Verifies CLI input mode overrides metadata.mode (opposite of MCP behavior).
    const finding = {
      id: 'rule:test:1',
      domain: 'rule',
      type: 'rule-violation',
      detectorId: 'rules-engine',
      severity: 'high' as const,
      title: 't',
      summary: '',
      involvedNodeIds: [],
      evidenceIds: [],
      status: 'open' as const,
      metadata: { ruleId: 'custom:test', mode: 'enforce' },
    }
    expect(computeVerdict({ newViolations: [finding], newFindings: [], mode: 'advisory' })).toBe(
      'ok',
    )
    expect(computeVerdict({ newViolations: [finding], newFindings: [], mode: undefined })).toBe(
      'violation',
    )
    expect(computeVerdict({ newViolations: [finding], newFindings: [], mode: 'warn' })).toBe('warn')
    expect(computeVerdict({ newViolations: [finding], newFindings: [], enforce: true })).toBe(
      'violation',
    )
  })

  it('--against ref triggers git diff <ref> instead of HEAD (smoke)', async () => {
    // Without a real git repo we can't easily verify the spawn arg list; this
    // test ensures runValidateDiff accepts `against` without crashing when
    // workingFiles is also provided (workingFiles takes precedence → git not invoked).
    const projectRoot = await mkdtemp(join(tmpdir(), 'vg-vd-'))
    try {
      await mkdir(join(projectRoot, '.vibegraph', 'cache'), { recursive: true })
      await writeFile(
        join(projectRoot, '.vibegraph', 'cache', 'baseline.json'),
        JSON.stringify(minimalBaseline(projectRoot, [])),
      )
      const r = await runValidateDiff({ projectRoot, workingFiles: [], against: 'origin/main' })
      expect(r.status).toBe('ok')
    } finally {
      await rm(projectRoot, { recursive: true, force: true })
    }
  })
})

describe('computeVerdict — advisory clamps high-severity escalation (regression: PR #13)', () => {
  const highSeverityNonRuleFinding = {
    id: 'fnd:drift:1',
    domain: 'drift' as const,
    type: 'undeclared',
    detectorId: 'core/drift',
    severity: 'high' as const,
    title: 'New high-severity drift',
    summary: '',
    involvedNodeIds: [],
    evidenceIds: [],
    status: 'open' as const,
    metadata: {},
  }

  it('without --mode: high-severity non-rule finding → violation (exit 1)', () => {
    expect(computeVerdict({ newViolations: [], newFindings: [highSeverityNonRuleFinding] })).toBe(
      'violation',
    )
  })

  it('--mode advisory clamps high-severity non-rule finding to warn (exit 0)', () => {
    // The bug pre-fix: --advisory was advertised "Never escalates exit code" but
    // computeVerdict still returned 'violation' for high newFindings, so CI/hook
    // invoked with --advisory could get exit 1 unexpectedly.
    expect(
      computeVerdict({
        newViolations: [],
        newFindings: [highSeverityNonRuleFinding],
        mode: 'advisory',
      }),
    ).toBe('warn')
  })

  it('--mode advisory still returns ok when nothing fires', () => {
    expect(computeVerdict({ newViolations: [], newFindings: [], mode: 'advisory' })).toBe('ok')
  })
})

function minimalBaseline(projectRoot: string, findings: Array<Record<string, unknown>>) {
  return {
    schemaVersion: '1.0',
    snapshotId: '00000000-0000-0000-0000-000000000000',
    createdAt: new Date().toISOString(),
    fingerprint: 'sha256:test',
    nodes: [],
    edges: [],
    findings,
  }
}

function ruleFinding(
  mode: 'advisory' | 'warn' | 'enforce',
  id: string,
  title: string,
  severity: 'low' | 'medium' | 'high' = 'high',
) {
  return {
    id,
    domain: 'rule',
    type: 'rule-violation',
    detectorId: 'rules-engine',
    severity,
    title,
    summary: '',
    involvedNodeIds: [],
    evidenceIds: [],
    status: 'open',
    metadata: { ruleId: 'custom:test', mode },
  }
}

describe('resolveExitCode', () => {
  it('always 0 in hook mode regardless of failure', () => {
    expect(resolveExitCode({ hook: true, failureExit: 1 })).toBe(0)
    expect(resolveExitCode({ hook: true, failureExit: 0 })).toBe(0)
  })

  it('reflects failureExit when not in hook mode', () => {
    expect(resolveExitCode({ hook: false, failureExit: 1 })).toBe(1)
    expect(resolveExitCode({ hook: false, failureExit: 0 })).toBe(0)
  })
})

describe('validateDiffCommand CLI boundary — --hook NO_BASELINE emits advisory nudge (Task 8)', () => {
  it('--hook with no baseline emits the advisory nudge JSON and exits 0', async () => {
    const projectRoot = await mkdtemp(join(tmpdir(), 'vg-vd-hook-no-baseline-'))
    try {
      await mkdir(join(projectRoot, '.vibegraph', 'cache'), { recursive: true })
      // No baseline.json written — runValidateDiff will return NO_BASELINE error.
      const chunks: string[] = []
      const spy = vi.spyOn(process.stdout, 'write').mockImplementation((chunk) => {
        chunks.push(typeof chunk === 'string' ? chunk : String(chunk))
        return true
      })
      const prevCode = process.exitCode
      try {
        await validateDiffCommand.run?.({
          args: {
            root: projectRoot,
            hook: true,
            json: false,
            markdown: false,
            enforce: false,
            advisory: false,
            quiet: false,
          },
          cmd: validateDiffCommand,
        })
        const output = chunks.join('')
        const parsed = JSON.parse(output) as Record<string, unknown>
        expect(parsed).toHaveProperty('hookSpecificOutput')
        const hookOut = parsed.hookSpecificOutput as Record<string, unknown>
        expect(hookOut.hookEventName).toBe('PostToolUse')
        expect(hookOut.additionalContext).toContain('no baseline yet')
        expect(hookOut.additionalContext).toContain('vibe-graph baseline')
        expect(process.exitCode).toBe(0)
      } finally {
        spy.mockRestore()
        process.exitCode = prevCode
      }
    } finally {
      await rm(projectRoot, { recursive: true, force: true })
    }
  })
})

describe('validateDiffCommand CLI boundary — --hook stays silent outside opted-in projects', () => {
  // The plugin hook fires on every Edit/Write in every repo on the machine. A
  // repo that never ran vibe-graph must not get a nudge per edit, and the hook
  // must not create .vibegraph/ there (which would opt the repo in by accident).
  it('--hook in a project without .vibegraph/ emits nothing, exits 0 and creates no .vibegraph/', async () => {
    const projectRoot = await mkdtemp(join(tmpdir(), 'vg-vd-hook-not-opted-in-'))
    try {
      const chunks: string[] = []
      const spy = vi.spyOn(process.stdout, 'write').mockImplementation((chunk) => {
        chunks.push(typeof chunk === 'string' ? chunk : String(chunk))
        return true
      })
      const prevCode = process.exitCode
      process.exitCode = undefined
      try {
        await validateDiffCommand.run?.({
          args: {
            root: projectRoot,
            hook: true,
            json: true,
            markdown: false,
            enforce: false,
            advisory: false,
            quiet: false,
          },
          cmd: validateDiffCommand,
        })
        expect(chunks.join('')).toBe('')
        expect(process.exitCode ?? 0).toBe(0)
        expect(existsSync(join(projectRoot, '.vibegraph'))).toBe(false)
      } finally {
        spy.mockRestore()
        process.exitCode = prevCode
      }
    } finally {
      await rm(projectRoot, { recursive: true, force: true })
    }
  })
})

describe('validateDiffCommand CLI boundary — --markdown covers early-return errors (Fix 3)', () => {
  it('--markdown --mode bogus emits the validate-diff header and dedupe marker, exits 1', async () => {
    const chunks: string[] = []
    const spy = vi.spyOn(process.stdout, 'write').mockImplementation((chunk) => {
      chunks.push(typeof chunk === 'string' ? chunk : String(chunk))
      return true
    })
    const prevCode = process.exitCode
    try {
      await validateDiffCommand.run?.({
        args: {
          mode: 'bogus',
          markdown: true,
          json: false,
          enforce: false,
          advisory: false,
          quiet: false,
        },
        cmd: validateDiffCommand,
      })
      const output = chunks.join('')
      expect(output).toContain('## 🔭 Vibe Graph')
      expect(output).toContain('<!-- vibe-graph-validate-diff -->')
      expect(process.exitCode).toBe(1)
    } finally {
      spy.mockRestore()
      process.exitCode = prevCode
    }
  })

  it('--markdown --diff <nonexistent> emits the validate-diff header and dedupe marker, exits 1', async () => {
    const chunks: string[] = []
    const spy = vi.spyOn(process.stdout, 'write').mockImplementation((chunk) => {
      chunks.push(typeof chunk === 'string' ? chunk : String(chunk))
      return true
    })
    const prevCode = process.exitCode
    try {
      await validateDiffCommand.run?.({
        args: {
          diff: '/nonexistent/path/that/does/not/exist.diff',
          markdown: true,
          json: false,
          enforce: false,
          advisory: false,
          quiet: false,
        },
        cmd: validateDiffCommand,
      })
      const output = chunks.join('')
      expect(output).toContain('## 🔭 Vibe Graph')
      expect(output).toContain('<!-- vibe-graph-validate-diff -->')
      expect(process.exitCode).toBe(1)
    } finally {
      spy.mockRestore()
      process.exitCode = prevCode
    }
  })
})

// ---------------------------------------------------------------------------
// Fix 1 (CLI): new file not in baseline → must emit new-coupling via ownershipEdges
// ---------------------------------------------------------------------------
describe('runValidateDiff — new-coupling for newly added file (Fix 1)', () => {
  it('emits new-coupling when a NEW file absent from baseline imports across subsystem boundary', async () => {
    const projectRoot = await mkdtemp(join(tmpdir(), 'vg-vd-newfile-cli-'))
    try {
      await mkdir(join(projectRoot, '.vibegraph', 'cache'), { recursive: true })
      await mkdir(join(projectRoot, '.vibegraph', 'subsystems'), { recursive: true })
      await mkdir(join(projectRoot, 'src', 'alpha'), { recursive: true })
      await mkdir(join(projectRoot, 'src', 'beta'), { recursive: true })

      await writeFile(
        join(projectRoot, 'package.json'),
        JSON.stringify({ name: 'cli-newfile-coupling', version: '0.0.0', dependencies: {} }),
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

      await writeFile(
        join(projectRoot, 'src', 'beta', 'index.ts'),
        'export const beta = 42\n',
        'utf-8',
      )
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

      // Baseline: has subsystem nodes + beta's contains edge, but NO contains edge for
      // alpha/new-file.ts (that file is brand new — not in baseline).
      const baseline = {
        schemaVersion: '1.0',
        snapshotId: '00000000-0000-0000-0000-000000000002',
        createdAt: new Date().toISOString(),
        fingerprint: 'sha256:cli-newfile',
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
      await writeFile(
        join(projectRoot, '.vibegraph', 'cache', 'baseline.json'),
        JSON.stringify(baseline),
        'utf-8',
      )

      const res = await runValidateDiff({ projectRoot, workingFiles: ['src/alpha/new-file.ts'] })
      if (res.status !== 'ok') throw new Error(res.error)

      // In curated mode (subsystem YAMLs present) the drift detector emits an
      // `undeclared` finding which replaces the synthetic `new-coupling`.
      expect(
        res.newFindings.some((f) => f.type === 'new-coupling' || f.type === 'undeclared'),
      ).toBe(true)
      expect(res.conformance?.byKind.coupling).toBeGreaterThanOrEqual(1)
    } finally {
      await rm(projectRoot, { recursive: true, force: true })
    }
  }, 30_000)
})

// ---------------------------------------------------------------------------
// Fix 2 (CLI): --hook --enforce → decision:block; --hook alone → additionalContext
// ---------------------------------------------------------------------------
describe('validateDiffCommand — --hook --enforce emits decision:block (Fix 2)', () => {
  it('--hook --enforce with a dirty result emits {decision:"block"} and exitCode 0', async () => {
    const projectRoot = await mkdtemp(join(tmpdir(), 'vg-vd-hook-enforce-'))
    try {
      await mkdir(join(projectRoot, '.vibegraph', 'cache'), { recursive: true })
      await mkdir(join(projectRoot, '.vibegraph', 'subsystems'), { recursive: true })
      await mkdir(join(projectRoot, 'src', 'alpha'), { recursive: true })
      await mkdir(join(projectRoot, 'src', 'beta'), { recursive: true })

      await writeFile(
        join(projectRoot, 'package.json'),
        JSON.stringify({ name: 'hook-enforce-test', version: '0.0.0', dependencies: {} }),
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
      await writeFile(
        join(projectRoot, 'src', 'beta', 'index.ts'),
        'export const beta = 42\n',
        'utf-8',
      )
      await writeFile(
        join(projectRoot, 'src', 'alpha', 'index.ts'),
        "import { beta } from '../beta/index.js'\nexport const alpha = beta\n",
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

      // Baseline: subsystem nodes + alpha's contains edge, NO coupling edge
      const baseline = {
        schemaVersion: '1.0',
        snapshotId: '00000000-0000-0000-0000-000000000003',
        createdAt: new Date().toISOString(),
        fingerprint: 'sha256:hook-enforce',
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
        ],
        findings: [],
      }
      await writeFile(
        join(projectRoot, '.vibegraph', 'cache', 'baseline.json'),
        JSON.stringify(baseline),
        'utf-8',
      )

      const chunks: string[] = []
      const spy = vi.spyOn(process.stdout, 'write').mockImplementation((chunk) => {
        chunks.push(typeof chunk === 'string' ? chunk : String(chunk))
        return true
      })
      const prevCode = process.exitCode
      try {
        await validateDiffCommand.run?.({
          args: {
            root: projectRoot,
            workingFiles: 'src/alpha/index.ts',
            hook: true,
            enforce: true,
            json: false,
            markdown: false,
            advisory: false,
            quiet: false,
          },
          cmd: validateDiffCommand,
        })
        const output = chunks.join('')
        // --hook --enforce with new coupling → {decision:'block', reason:...}
        const parsed = JSON.parse(output) as Record<string, unknown>
        expect(parsed).toHaveProperty('decision', 'block')
        expect(typeof (parsed as { reason: unknown }).reason).toBe('string')
        expect((parsed as { reason: string }).reason).toContain('cross-subsystem link')
        // exit code must be 0 even in enforce hook mode
        expect(process.exitCode).toBe(0)
      } finally {
        spy.mockRestore()
        process.exitCode = prevCode
      }
    } finally {
      await rm(projectRoot, { recursive: true, force: true })
    }
  }, 30_000)

  it('--hook alone (no --enforce) with a dirty result emits additionalContext (unchanged behavior)', async () => {
    const projectRoot = await mkdtemp(join(tmpdir(), 'vg-vd-hook-advisory-'))
    try {
      await mkdir(join(projectRoot, '.vibegraph', 'cache'), { recursive: true })
      await mkdir(join(projectRoot, '.vibegraph', 'subsystems'), { recursive: true })
      await mkdir(join(projectRoot, 'src', 'alpha'), { recursive: true })
      await mkdir(join(projectRoot, 'src', 'beta'), { recursive: true })

      await writeFile(
        join(projectRoot, 'package.json'),
        JSON.stringify({ name: 'hook-advisory-test', version: '0.0.0', dependencies: {} }),
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
      await writeFile(
        join(projectRoot, 'src', 'beta', 'index.ts'),
        'export const beta = 42\n',
        'utf-8',
      )
      await writeFile(
        join(projectRoot, 'src', 'alpha', 'index.ts'),
        "import { beta } from '../beta/index.js'\nexport const alpha = beta\n",
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

      const baseline = {
        schemaVersion: '1.0',
        snapshotId: '00000000-0000-0000-0000-000000000004',
        createdAt: new Date().toISOString(),
        fingerprint: 'sha256:hook-advisory',
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
        ],
        findings: [],
      }
      await writeFile(
        join(projectRoot, '.vibegraph', 'cache', 'baseline.json'),
        JSON.stringify(baseline),
        'utf-8',
      )

      const chunks: string[] = []
      const spy = vi.spyOn(process.stdout, 'write').mockImplementation((chunk) => {
        chunks.push(typeof chunk === 'string' ? chunk : String(chunk))
        return true
      })
      const prevCode = process.exitCode
      try {
        await validateDiffCommand.run?.({
          args: {
            root: projectRoot,
            workingFiles: 'src/alpha/index.ts',
            hook: true,
            enforce: false,
            json: false,
            markdown: false,
            advisory: false,
            quiet: false,
          },
          cmd: validateDiffCommand,
        })
        const output = chunks.join('')
        // --hook only (advisory) → hookSpecificOutput.additionalContext
        const parsed = JSON.parse(output) as Record<string, unknown>
        expect(parsed).toHaveProperty('hookSpecificOutput')
        const hookOut = parsed.hookSpecificOutput as Record<string, unknown>
        expect(hookOut).toHaveProperty('additionalContext')
        expect(process.exitCode).toBe(0)
      } finally {
        spy.mockRestore()
        process.exitCode = prevCode
      }
    } finally {
      await rm(projectRoot, { recursive: true, force: true })
    }
  }, 30_000)
})

describe('runValidateDiff — conformance via shared core helpers', () => {
  // Approach: create a tmpdir project root with two subsystem YAML docs (alpha, beta)
  // where alpha depends_on beta. The baseline has no coupling edge between them
  // (nodes: [], edges: []). We pass workingFiles: ['some/file.ts'] so that
  // computeAffectedNodeIds produces file:some/file.ts + subsystem:alpha (via the
  // baseline contains edge we add). The working graph (real scan of tmpdir) picks
  // up the YAML-declared depends_on edge as a runtime-coupling edge. computeGraphDelta
  // sees it as newEdge; collectNewCoupling emits a new-coupling finding; conformance
  // reflects byKind.coupling >= 1.
  let projectRoot: string

  beforeEach(async () => {
    projectRoot = await mkdtemp(join(tmpdir(), 'vg-conformance-'))
    await mkdir(join(projectRoot, '.vibegraph', 'cache'), { recursive: true })
    await mkdir(join(projectRoot, '.vibegraph', 'subsystems'), { recursive: true })

    // Two subsystem YAML docs — alpha depends on beta (introduces a new coupling)
    await writeFile(
      join(projectRoot, '.vibegraph', 'subsystems', 'alpha.yml'),
      [
        'id: alpha',
        'title: Alpha',
        'layer: domain',
        'match: "alpha/**"',
        'depends_on:',
        '  - beta',
      ].join('\n'),
    )
    await writeFile(
      join(projectRoot, '.vibegraph', 'subsystems', 'beta.yml'),
      ['id: beta', 'title: Beta', 'layer: domain', 'match: "beta/**"'].join('\n'),
    )

    // Baseline: two subsystem nodes + a contains edge from subsystem:alpha to
    // file:some/file.ts (so computeAffectedNodeIds maps the changed file to alpha),
    // but NO coupling edge between the two subsystems.
    const baseline = {
      schemaVersion: '1.0',
      snapshotId: '00000000-0000-0000-0000-000000000001',
      createdAt: new Date().toISOString(),
      fingerprint: 'sha256:conformance-test',
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
        {
          id: 'subsystem:alpha->file:some/file.ts:contains',
          from: 'subsystem:alpha',
          to: 'file:some/file.ts',
          kind: 'contains',
          category: 'structural',
          source: 'derived',
          confidence: 'high',
          evidenceIds: [],
          weight: 1,
          runtimeWeight: 0,
          typeOnlyWeight: 0,
          dynamicWeight: 0,
          metadata: {},
        },
      ],
      findings: [],
    }
    await writeFile(
      join(projectRoot, '.vibegraph', 'cache', 'baseline.json'),
      JSON.stringify(baseline),
    )
  })

  afterEach(async () => {
    await rm(projectRoot, { recursive: true, force: true })
  })

  it('detects new cross-subsystem coupling and populates conformance', async () => {
    // workingFiles contains a file owned by alpha (per baseline contains edge),
    // so computeAffectedNodeIds yields {file:some/file.ts, subsystem:alpha}.
    // The scan of the tmpdir picks up the YAML-declared alpha→beta coupling edge.
    // The baseline has no such edge → graphDelta.newEdges includes it.
    // collectNewCoupling emits a new-coupling finding for alpha→beta.
    const res = await runValidateDiff({ projectRoot, workingFiles: ['some/file.ts'] })
    if (res.status !== 'ok') throw new Error(res.error)

    expect(res.status).toBe('ok')
    expect(res.newFindings.some((f) => f.type === 'new-coupling')).toBe(true)
    expect(res.conformance?.byKind.coupling).toBeGreaterThanOrEqual(1)
  })
})
