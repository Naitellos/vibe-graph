/**
 * test/e2e/self-hosting.test.ts
 *
 * Self-hosting e2e: the built vibe-graph CLI scans its own repo root and
 * the built MCP server answers a tools/call against the produced snapshot.
 *
 * Scan root: repo root (--root <repoRoot>).
 *   - The pnpm-workspace.yaml at the repo root enumerates packages/*,
 *     so the subsystem analyzer finds core/cli/mcp/ui as workspaces.
 *   - fixtures/synthetic/simple-cycle is NOT a workspace member, so it
 *     does NOT produce a cycle finding at the subsystem level (the cycle
 *     detector only operates on subsystem→subsystem dependency edges).
 *
 * Subsystem IDs: v1 uses curated SubsystemDoc YAMLs in .vibegraph/subsystems/.
 *   - subsystem:core-engine    (packages/core — neutral engine, §8.5 split)
 *   - subsystem:core-extractor (packages/core — AST scan pipeline, §8.5 split)
 *   - subsystem:mcp            (packages/mcp — @codearch/mcp)
 *   - subsystem:ui             (packages/ui — @codearch/ui)
 *   - subsystem:cli            (packages/cli — vibe-graph)
 *   - subsystem:plugin         (packages/plugin — @codearch/plugin)
 *
 * Cross-package depends_on edges: cross-package imports that use npm package
 * names (e.g. `import ... from '@codearch/mcp'`) resolve to the package's
 * *source* (via synthesized workspace `paths`), so semantic collapse derives
 * subsystem→subsystem depends_on edges (e.g. cli→mcp). Spec §9.6 step 5's edge
 * assertion is exercised below. LIMITATION (accepted, §8.5 dogfood): imports of
 * '@codearch/core' resolve to the barrel packages/core/src/index.ts, which is
 * intentionally unowned after the core-engine/core-extractor split, so
 * cli/mcp/ui→core-* depends_on cannot be derived from AST and their declared
 * deps surface as drift:stale. cli↔ui have NO code dependency (the CLI bundles
 * ui's built assets and serves them over HTTP — a packaging/runtime
 * relationship), so neither subsystem declares the other in
 * depends_on/consumed_by and no cli→ui drift/layer finding is produced.
 *
 * Note: build is handled in test/e2e/global-setup.ts
 */

import { type ChildProcessWithoutNullStreams, spawn, spawnSync } from 'node:child_process'
import { existsSync } from 'node:fs'
import { readFile } from 'node:fs/promises'
import { dirname, join, resolve } from 'node:path'
import { fileURLToPath } from 'node:url'
import { afterAll, beforeAll, describe, expect, it } from 'vitest'

import {
  SnapshotSchema,
  buildLoadedSnapshot,
  evaluateRules,
  loadConfig,
  loadGraphBaseline,
} from '@codearch/core'

import { sendRequest } from './helpers/jsonrpc.js'

const __dirname = dirname(fileURLToPath(import.meta.url))
const repoRoot = resolve(__dirname, '../..')
const binPath = join(repoRoot, 'packages/cli/dist/bin.js')
const snapshotPath = join(repoRoot, '.vibegraph/cache/graph.json')

// The MCP server needs a project root that already has a snapshot; we
// point it at the repo root after the scan has run.
const mcpProjectRoot = repoRoot

describe('vibe-graph self-hosting (E2E)', () => {
  beforeAll(() => {
    // Run the CLI scan once before all tests
    const result = spawnSync('node', [binPath, 'scan', '--root', repoRoot], {
      cwd: repoRoot,
      stdio: 'pipe',
      shell: false,
      encoding: 'utf-8',
      timeout: 90_000,
    })
    if (result.status !== 0) {
      throw new Error(`vibe-graph scan failed (status ${result.status}): ${result.stderr}`)
    }
  }, 120_000)

  it('writes a snapshot to .vibegraph/cache/graph.json', () => {
    expect(existsSync(snapshotPath)).toBe(true)
  })

  it('snapshot contains 6 subsystems from curated SubsystemDoc YAMLs', async () => {
    const raw = await readFile(snapshotPath, 'utf-8')
    const snap = JSON.parse(raw) as {
      nodes: Array<{ id: string; kind: string }>
      findings: Array<{ id: string; domain: string; status: string }>
    }
    const subsystemNodes = snap.nodes.filter((n) => n.kind === 'subsystem')
    expect(subsystemNodes).toHaveLength(6)

    const subsystemIds = new Set(subsystemNodes.map((n) => n.id))
    // v1: curated SubsystemDoc YAMLs use short ids (not package names).
    // core is split into core-engine / core-extractor (§8.5 boundary dogfood).
    expect(subsystemIds).toContain('subsystem:core-engine')
    expect(subsystemIds).toContain('subsystem:core-extractor')
    expect(subsystemIds).toContain('subsystem:mcp')
    expect(subsystemIds).toContain('subsystem:ui')
    expect(subsystemIds).toContain('subsystem:cli')
    expect(subsystemIds).toContain('subsystem:plugin')

    // Drift accounting after the core-engine/core-extractor split (§8.5):
    //   - 5 stale: cli/mcp/ui declare depends_on core-engine (+ cli/mcp on
    //     core-extractor), but all consumption goes through the intentionally
    //     unowned barrel packages/core/src/index.ts, so no AST evidence exists.
    //   - 1 undeclared: core-engine → core-extractor — the two known
    //     core-neutrality violations (diff/working-graph.ts imports scan;
    //     helpers/context-pack-builder.test.ts imports analyzers/ignore-matcher),
    //     backlog, not declared.
    //   - 3 unowned: index.ts (by design), _smoke.test.ts, tsup.config.ts.
    // Any drift finding NOT in this accepted set is a regression and fails here.
    const KNOWN_DRIFT_IDS = new Set([
      'drift:stale:subsystem:cli:subsystem:core-engine',
      'drift:stale:subsystem:cli:subsystem:core-extractor',
      'drift:stale:subsystem:mcp:subsystem:core-engine',
      'drift:stale:subsystem:mcp:subsystem:core-extractor',
      'drift:stale:subsystem:ui:subsystem:core-engine',
      'drift:undeclared:subsystem:core-engine:subsystem:core-extractor',
      'drift:unowned:file:packages/core/src/index.ts',
      'drift:unowned:file:packages/core/src/_smoke.test.ts',
      'drift:unowned:file:packages/core/tsup.config.ts',
    ])
    const driftFindings = snap.findings.filter((f) => f.domain === 'drift')
    const openDrift = driftFindings.filter((f) => f.status === 'open')
    const unexpected = openDrift.filter((f) => !KNOWN_DRIFT_IDS.has(f.id))
    expect(unexpected).toEqual([])
  })

  it('derives cross-package depends_on edges from workspace imports (spec §9.6 step 5)', async () => {
    const raw = await readFile(snapshotPath, 'utf-8')
    const snap = JSON.parse(raw) as {
      edges: Array<{ from: string; to: string; kind: string; source: string }>
    }
    const hasDerivedDep = (from: string, to: string) =>
      snap.edges.some(
        (e) => e.kind === 'depends_on' && e.source === 'derived' && e.from === from && e.to === to,
      )

    // vibe-graph (cli) imports @codearch/mcp — must resolve to source and collapse.
    // (cli/mcp/ui→core-* CANNOT be derived: '@codearch/core' resolves to the
    // intentionally unowned barrel index.ts — see header LIMITATION note.)
    expect(hasDerivedDep('subsystem:cli', 'subsystem:mcp')).toBe(true)
    // Intra-package cross-subsystem collapse across the §8.5 split: the
    // extractor's relative imports of engine dirs (schema/, config/, …) must
    // collapse to core-extractor→core-engine.
    expect(hasDerivedDep('subsystem:core-extractor', 'subsystem:core-engine')).toBe(true)
  })

  it('snapshot has no cycle findings beyond the accepted §8.5 engine↔extractor cycle', async () => {
    const raw = await readFile(snapshotPath, 'utf-8')
    const snap = JSON.parse(raw) as { findings: Array<{ id: string; type: string }> }
    const cycles = snap.findings.filter((f) => f.type === 'cycle')
    // The core-engine↔core-extractor cycle is the honest §8.5 seam violation
    // surfaced by the boundary dogfood (the two known core-neutrality violations:
    // diff/working-graph.ts imports scan, and the test-only import of
    // analyzers/ignore-matcher in helpers/context-pack-builder.test.ts) —
    // accepted as backlog. Any OTHER cycle is a regression.
    // Two-sided pin on purpose: inverting the working-graph → scan dependency
    // must come here and empty this list.
    expect(cycles.map((f) => f.id)).toEqual([
      'fnd:core/cycles:subsystem:core-engine,subsystem:core-extractor',
    ])
  })

  describe('MCP server answers get_project_overview', () => {
    let child: ChildProcessWithoutNullStreams

    beforeAll(() => {
      child = spawn('node', [binPath, 'mcp', '--project-root', mcpProjectRoot], {
        cwd: repoRoot,
        stdio: ['pipe', 'pipe', 'pipe'],
        shell: false,
      })
      child.stderr.on('data', (chunk: Buffer) => {
        process.stderr.write(`[self-hosting-mcp] ${chunk}`)
      })
    })

    afterAll(() => {
      child.kill()
    })

    it('returns counts.subsystems ≥ 4 via structuredContent', async () => {
      const resp = await sendRequest(child, {
        jsonrpc: '2.0',
        id: 1,
        method: 'tools/call',
        params: { name: 'get_project_overview', arguments: {} },
      })
      expect(resp.error).toBeUndefined()
      expect(resp.result).toBeDefined()

      // The MCP server returns both structuredContent (typed output) and
      // content[0].text (JSON string fallback). Prefer structuredContent;
      // fall back to parsing content[0].text if structuredContent is absent.
      const result = resp.result as {
        structuredContent?: { counts?: { subsystems?: number }; project?: { name?: string } }
        content?: Array<{ type: string; text: string }>
      }

      let overview: { counts: { subsystems: number }; project: { name: string } }
      if (result.structuredContent?.counts !== undefined) {
        overview = result.structuredContent as typeof overview
      } else if (result.content?.[0]?.text !== undefined) {
        overview = JSON.parse(result.content[0].text) as typeof overview
      } else {
        throw new Error(`Unexpected MCP response shape: ${JSON.stringify(resp.result)}`)
      }

      expect(overview.counts.subsystems).toBeGreaterThanOrEqual(5)

      // Spec §9.6 step 9: assert project.name contains 'vibe-graph'.
      // The actual root package.json names this monorepo 'vibe-graph-monorepo',
      // so we check for the substring rather than exact match per spec.
      expect(overview.project.name).toMatch(/vibe-graph/)
    })
  })

  describe('rules engine self-hosting smoke', () => {
    it('rules engine: 4 default builtin rules are merged into loaded config', async () => {
      const { config } = await loadConfig(repoRoot)
      const ruleIds = config.rules.map((r) => r.id)
      expect(ruleIds).toContain('builtin:no-new-cycles')
      expect(ruleIds).toContain('builtin:no-layer-violation')
      expect(ruleIds).toContain('builtin:no-new-orphans')
      expect(ruleIds).toContain('builtin:drift-must-not-worsen')
    })

    it('rules engine: scan completes and rule findings (if any) have domain="rule"', async () => {
      const raw = await readFile(snapshotPath, 'utf-8')
      const snap = JSON.parse(raw) as {
        findings: Array<{ id: string; domain: string; metadata?: Record<string, unknown> }>
      }
      const ruleFindings = snap.findings.filter((f) => f.domain === 'rule')
      // Don't require any rule findings — just verify shape if present
      for (const f of ruleFindings) {
        expect(typeof f.metadata?.ruleId).toBe('string')
      }
      // Pass even if zero rule findings — the goal is "engine doesn't crash on real repo"
    })

    it('rules engine: evaluateRules runs cleanly against the self-hosted snapshot', async () => {
      const { config } = await loadConfig(repoRoot)
      const raw = await readFile(snapshotPath, 'utf-8')
      const snap = SnapshotSchema.parse(JSON.parse(raw))
      const loaded = buildLoadedSnapshot(snap)
      const baseline = await loadGraphBaseline(repoRoot)
      // Should not throw, should return an array (possibly empty)
      const findings = evaluateRules({ snapshot: loaded, baseline, rules: config.rules })
      expect(Array.isArray(findings)).toBe(true)
    })

    it('cli check works on the self-hosted snapshot (JSON mode)', () => {
      const out = spawnSync('node', [binPath, 'check', '--root', repoRoot, '--json'], {
        cwd: repoRoot,
        encoding: 'utf-8',
        timeout: 30_000,
      })
      // 0 (clean) or 1 (enforce violation) both prove the binary works on real data
      expect(out.status).toBeLessThanOrEqual(1)
      const lastLine =
        out.stdout
          .trim()
          .split('\n')
          .filter((s) => s.length > 0)
          .pop() ?? '{}'
      const parsed = JSON.parse(lastLine) as { status: string; findings: unknown }
      expect(parsed.status).toBe('ok')
      expect(Array.isArray(parsed.findings)).toBe(true)
    })
  })

  it('thin AI refactor loop works on vibe-graph itself', async () => {
    // Ensure a fresh baseline exists before starting the MCP server so that
    // prepare_task can record a baselineSnapshotId and validate_diff can
    // compare against it.
    const baselineResult = spawnSync('node', [binPath, 'baseline', '--root', repoRoot, '--json'], {
      cwd: repoRoot,
      stdio: 'pipe',
      shell: false,
      encoding: 'utf-8',
      timeout: 30_000,
    })
    expect(baselineResult.status).toBe(0)

    const child = spawn('node', [binPath, 'mcp', '--project-root', repoRoot], {
      cwd: repoRoot,
      stdio: ['pipe', 'pipe', 'pipe'],
      shell: false,
    })
    child.stderr.on('data', (chunk: Buffer) => {
      process.stderr.write(`[self-hosting-thin-loop] ${chunk}`)
    })

    try {
      // 1. prepare_task on a real file in the core package. NOTE: not the
      // barrel index.ts — it is intentionally unowned after the §8.5
      // core-engine/core-extractor split, so prepare_task would (correctly)
      // return NO_MATCHING_SUBSYSTEM for it.
      const prepResp = await sendRequest(child, {
        jsonrpc: '2.0',
        id: 10,
        method: 'tools/call',
        params: {
          name: 'prepare_task',
          arguments: {
            intent: 'self-host smoke test',
            paths: ['packages/core/src/scan/scan.ts'],
            mode: 'refactor',
          },
        },
      })
      expect(prepResp.error).toBeUndefined()
      expect(prepResp.result).toBeDefined()

      const prepMcpResult = prepResp.result as Record<string, unknown>
      if (prepMcpResult.isError === true) {
        throw new Error(`prepare_task failed: ${JSON.stringify(prepMcpResult)}`)
      }
      const prepParsed = ((prepMcpResult.structuredContent as Record<string, unknown>) ??
        prepMcpResult) as Record<string, unknown>

      const prepTarget = prepParsed.target as Record<string, unknown>
      expect(Array.isArray(prepTarget.subsystems)).toBe(true)
      expect((prepTarget.subsystems as string[]).length).toBeGreaterThan(0)
      expect(typeof prepParsed.taskId).toBe('string')
      expect(prepParsed.taskId as string).toMatch(/^task_/)

      const taskId = prepParsed.taskId as string
      const baselineSnapshotId = prepParsed.baselineSnapshotId as string

      // 2. validate_diff with no working-tree changes — should report status='ok'
      const valResp = await sendRequest(child, {
        jsonrpc: '2.0',
        id: 11,
        method: 'tools/call',
        params: {
          name: 'validate_diff',
          arguments: { taskId, workingFiles: [] },
        },
      })
      expect(valResp.error).toBeUndefined()
      expect(valResp.result).toBeDefined()

      const valMcpResult = valResp.result as Record<string, unknown>
      if (valMcpResult.isError === true) {
        throw new Error(`validate_diff failed: ${JSON.stringify(valMcpResult)}`)
      }
      const valParsed = ((valMcpResult.structuredContent as Record<string, unknown>) ??
        valMcpResult) as Record<string, unknown>

      expect(valParsed.status).toBe('ok')
      expect(valParsed.taskId).toBe(taskId)
      expect(valParsed.baselineSnapshotId).toBe(baselineSnapshotId)
    } finally {
      child.kill()
    }
  }, 180_000) // longer timeout for full repo scan + MCP startup
})
