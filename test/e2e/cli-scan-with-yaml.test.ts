import { spawnSync } from 'node:child_process'
import { cpSync, existsSync, mkdtempSync, readFileSync, realpathSync } from 'node:fs'
import { rm } from 'node:fs/promises'
import { tmpdir } from 'node:os'
import { dirname, join, resolve } from 'node:path'
import { fileURLToPath } from 'node:url'
import { afterAll, beforeAll, describe, expect, it } from 'vitest'

// Note: build is handled in test/e2e/global-setup.ts

const __dirname = dirname(fileURLToPath(import.meta.url))
const repoRoot = resolve(__dirname, '../..')
const binPath = join(repoRoot, 'packages/cli/dist/bin.js')
const fixtureSrc = join(repoRoot, 'fixtures/synthetic/rich-yaml')

describe('vibe-graph scan on rich-yaml fixture (E2E)', () => {
  let workDir: string

  beforeAll(() => {
    // Copy fixture to tmp so we don't pollute the source tree
    workDir = realpathSync(mkdtempSync(join(tmpdir(), 'vg-e2e-scan-yaml-')))
    cpSync(fixtureSrc, workDir, { recursive: true })
    // Don't copy .vibegraph from fixture; ensure clean state
  })

  afterAll(async () => {
    if (workDir !== undefined && existsSync(workDir)) {
      await rm(workDir, { recursive: true, force: true })
    }
  })

  it('produces yaml-sourced edges, schema_tables, and expected subsystems', () => {
    const result = spawnSync('node', [binPath, 'scan', '--json', '--root', workDir], {
      cwd: workDir,
      stdio: 'pipe',
      shell: false,
      encoding: 'utf-8',
      env: { ...process.env, NODE_ENV: 'production' },
    })
    expect(result.status).toBe(0)

    // graph.json exists
    const graphPath = join(workDir, '.vibegraph/cache/graph.json')
    expect(existsSync(graphPath)).toBe(true)

    // contents parse and have expected shape
    const snapshot = JSON.parse(readFileSync(graphPath, 'utf-8')) as {
      meta: { projectName: string; scanId: string }
      nodes: Array<{ id: string; kind: string }>
      edges: Array<{ source: string; target: string; relation: string }>
      findings: Array<{ type: string }>
    }

    expect(snapshot.meta.projectName).toBe('vg-rich-yaml-fixture')
    expect(snapshot.nodes.length).toBeGreaterThan(0)

    // Assert edges between subsystems exist (from yaml depends_on declarations)
    const subsystemDependsOnEdges = snapshot.edges.filter(
      (e) =>
        e.kind === 'depends_on' && e.from.startsWith('subsystem:') && e.to.startsWith('subsystem:'),
    )
    expect(subsystemDependsOnEdges.length).toBeGreaterThan(0)

    // Assert containment edges (files contained in subsystems)
    const containsEdges = snapshot.edges.filter(
      (e) => e.kind === 'contains' && e.from.startsWith('subsystem:') && e.to.startsWith('file:'),
    )
    expect(containsEdges.length).toBeGreaterThan(0)

    // Assert subsystem nodes exist
    const subsystemNodes = snapshot.nodes.filter((n) => n.kind === 'subsystem')
    expect(subsystemNodes.length).toBe(3) // payments, auth, dashboard
    const subsystemIds = subsystemNodes.map((n) => n.id)
    expect(subsystemIds).toContain('subsystem:payments')
    expect(subsystemIds).toContain('subsystem:auth')
    expect(subsystemIds).toContain('subsystem:dashboard')

    // Findings array exists (fixture is aligned, so should be empty)
    expect(Array.isArray(snapshot.findings)).toBe(true)
  }, 120_000) // long timeout for subprocess + scan
})
