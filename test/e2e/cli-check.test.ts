// test/e2e/cli-check.test.ts
//
// E2E tests for `vibe-graph check`.
//
// Scenarios:
// 1. No graph.json -> exits 1, output mentions "No graph.json"
// 2. graph.json with zero rule findings -> exits 0, stdout "No rule violations"
// 3. graph.json with warn-mode rule finding -> exits 0, stdout lists the finding
// 4. --enforce flag -> exits 1 even on warn-mode finding
// 5. --json flag -> valid JSON { status: 'ok', exitCode: 0, findings: [] }

import { spawnSync } from 'node:child_process'
import { randomUUID } from 'node:crypto'
import { mkdir, rm, writeFile } from 'node:fs/promises'
import { tmpdir } from 'node:os'
import { dirname, join, resolve } from 'node:path'
import { fileURLToPath } from 'node:url'
import { afterEach, beforeEach, describe, expect, it } from 'vitest'

// Note: build is handled in test/e2e/global-setup.ts

const __dirname = dirname(fileURLToPath(import.meta.url))
const repoRoot = resolve(__dirname, '../..')
const CLI = join(repoRoot, 'packages', 'cli', 'dist', 'bin.js')

describe('e2e: vibe-graph check', () => {
  let tmpRoot: string

  beforeEach(async () => {
    tmpRoot = join(tmpdir(), `vg-e2e-check-${Date.now()}-${Math.floor(Math.random() * 1e9)}`)
    await mkdir(join(tmpRoot, '.vibegraph', 'cache'), { recursive: true })
  })

  afterEach(async () => {
    await rm(tmpRoot, { recursive: true, force: true })
  })

  /**
   * Seeds .vibegraph/cache/graph.json with subsystems `domain` (layer:domain)
   * and `ui` (layer:horizontal) and an optional violating `depends_on` edge.
   * runCheck re-evaluates rules against current config, so the graph must
   * contain real triggers (not pre-computed findings).
   */
  async function seedGraph(includeViolatingEdge: boolean): Promise<void> {
    const graphPath = join(tmpRoot, '.vibegraph', 'cache', 'graph.json')
    const scanId = randomUUID()
    const snapshot = {
      meta: {
        schemaVersion: '0.1.0',
        scanId,
        builtAt: '2026-05-28T00:00:00.000Z',
        projectRoot: tmpRoot,
        projectName: 'e2e',
        vibegraphVersion: '0.0.0',
        scanDurationMs: 0,
        fileCounts: { scanned: 0, indexed: 0, skipped: 0 },
      },
      nodes: [
        {
          id: 'subsystem:domain',
          kind: 'subsystem',
          title: 'domain',
          layer: 'domain',
          status: 'unknown',
          tags: [],
          files: [],
          metadata: {},
        },
        {
          id: 'subsystem:ui',
          kind: 'subsystem',
          title: 'ui',
          layer: 'horizontal',
          status: 'unknown',
          tags: [],
          files: [],
          metadata: {},
        },
      ],
      edges: includeViolatingEdge
        ? [
            {
              id: 'edge:domain-ui',
              from: 'subsystem:domain',
              to: 'subsystem:ui',
              kind: 'depends_on',
              category: 'structural',
              source: 'manual',
              confidence: 'high',
              evidenceIds: [],
              weight: 1,
              runtimeWeight: 0,
              typeOnlyWeight: 0,
              dynamicWeight: 0,
              metadata: {},
            },
          ]
        : [],
      evidence: [],
      findings: [],
    }
    await writeFile(graphPath, `${JSON.stringify(snapshot)}\n`, 'utf-8')
  }

  /** Write a config.yml with a custom edge-pattern rule at the given mode. */
  async function seedConfigWithCustomRule(mode: 'advisory' | 'warn' | 'enforce'): Promise<void> {
    await writeFile(
      join(tmpRoot, '.vibegraph', 'config.yml'),
      [
        'project:',
        '  name: e2e',
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

  /**
   * Write a config.yml with a rule referencing subsystems absent from the graph
   * (the seeded graph only has `domain` + `ui`), so the rule is inert.
   */
  async function seedConfigWithInertRule(): Promise<void> {
    await writeFile(
      join(tmpRoot, '.vibegraph', 'config.yml'),
      [
        'project:',
        '  name: e2e',
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
  }

  it('exits 1 when no graph.json exists', () => {
    const result = spawnSync('node', [CLI, 'check', '--root', tmpRoot], {
      encoding: 'utf-8',
    })
    expect(result.status).toBe(1)
    expect(result.stdout + result.stderr).toContain('No graph.json')
  })

  it('exits 0 and prints "No rule violations" when graph has no triggering edges', async () => {
    await seedGraph(false)
    const result = spawnSync('node', [CLI, 'check', '--root', tmpRoot], {
      encoding: 'utf-8',
    })
    expect(result.status).toBe(0)
    expect(result.stdout).toContain('No rule violations')
  })

  it('exits 0 and lists the finding when only warn-mode rule fires', async () => {
    await seedConfigWithCustomRule('warn')
    await seedGraph(true)
    const result = spawnSync('node', [CLI, 'check', '--root', tmpRoot], {
      encoding: 'utf-8',
    })
    expect(result.status).toBe(0)
    expect(result.stdout).toContain('custom:test')
    expect(result.stdout).toContain('warn')
  })

  it('exits 1 with --enforce flag even on a warn-mode finding', async () => {
    await seedConfigWithCustomRule('warn')
    await seedGraph(true)
    const result = spawnSync('node', [CLI, 'check', '--root', tmpRoot, '--enforce'], {
      encoding: 'utf-8',
    })
    expect(result.status).toBe(1)
  })

  it('exits 0 for an inert rule by default (warns, does not fail)', async () => {
    await seedConfigWithInertRule()
    await seedGraph(false)
    const result = spawnSync('node', [CLI, 'check', '--root', tmpRoot], {
      encoding: 'utf-8',
    })
    expect(result.status).toBe(0)
    expect(result.stdout).toContain('inert')
  })

  it('exits 1 with --strict-rules when a rule is inert', async () => {
    await seedConfigWithInertRule()
    await seedGraph(false)
    // Kebab form exercises the citty alias mapping (mri does not kebab-map keys).
    const result = spawnSync('node', [CLI, 'check', '--root', tmpRoot, '--strict-rules'], {
      encoding: 'utf-8',
    })
    expect(result.status).toBe(1)
    expect(result.stdout).toContain('strict-rules')
  })

  it('emits valid JSON with --json flag (zero findings)', async () => {
    await seedGraph(false)
    const result = spawnSync('node', [CLI, 'check', '--root', tmpRoot, '--json'], {
      encoding: 'utf-8',
    })
    expect(result.status).toBe(0)
    // stdout may have multiple lines from the logger; take the last non-empty line
    const lines = result.stdout
      .trim()
      .split('\n')
      .filter((s) => s.length > 0)
    const lastLine = lines.pop()
    if (lastLine === undefined) throw new Error('No output from --json')
    const parsed = JSON.parse(lastLine) as Record<string, unknown>
    expect(parsed).toMatchObject({ status: 'ok', exitCode: 0, findings: [] })
  })
})
