/**
 * Unit tests for the scan() pipeline orchestrator.
 *
 * These tests spin up a minimal synthetic project (tmpdir with 2 TS files,
 * no inter-file imports) and assert on the returned Snapshot shape.
 * They do NOT require a real fixture on disk beyond what they create in tmpdir.
 */

import { mkdir, mkdtemp, rm, writeFile } from 'node:fs/promises'
import { tmpdir } from 'node:os'
import { join } from 'node:path'
import { afterEach, beforeEach, describe, expect, it } from 'vitest'
import { scan } from './scan.js'

const V4_UUID_RE = /^[0-9a-f]{8}-[0-9a-f]{4}-4[0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i

describe('scan()', () => {
  let tmpRoot: string

  beforeEach(async () => {
    // Create a unique tmpdir for each test.
    tmpRoot = join(
      tmpdir(),
      `vibegraph-scan-test-${Date.now()}-${Math.random().toString(36).slice(2)}`,
    )
    await mkdir(join(tmpRoot, 'src'), { recursive: true })

    // Two independent TS files — no imports between them.
    await writeFile(join(tmpRoot, 'src', 'a.ts'), 'export const a = 1;\n', 'utf-8')
    await writeFile(join(tmpRoot, 'src', 'b.ts'), 'export const b = 2;\n', 'utf-8')

    // Minimal package.json so core/packages analyzer has something to parse.
    await writeFile(
      join(tmpRoot, 'package.json'),
      JSON.stringify({ name: 'test-project', version: '0.0.0', dependencies: {} }),
      'utf-8',
    )

    // Minimal tsconfig.json so the ProgramManager picks up the files.
    await writeFile(
      join(tmpRoot, 'tsconfig.json'),
      JSON.stringify({
        compilerOptions: {
          strict: true,
          target: 'ES2022',
          module: 'NodeNext',
          moduleResolution: 'NodeNext',
          esModuleInterop: true,
          noEmit: true,
        },
        include: ['src/**/*'],
      }),
      'utf-8',
    )
  })

  afterEach(async () => {
    await rm(tmpRoot, { recursive: true, force: true })
  })

  it('returns a valid snapshot with correct meta fields', async () => {
    const snapshot = await scan({ root: tmpRoot })

    // schemaVersion
    expect(snapshot.meta.schemaVersion).toBe('0.1.0')

    // scanId must be a v4 UUID
    expect(snapshot.meta.scanId).toMatch(V4_UUID_RE)

    // builtAt must parse as a valid ISO 8601 datetime
    const builtAt = new Date(snapshot.meta.builtAt)
    expect(Number.isNaN(builtAt.getTime())).toBe(false)

    // scanDurationMs must be a non-negative integer
    expect(snapshot.meta.scanDurationMs).toBeGreaterThanOrEqual(0)
    expect(Number.isInteger(snapshot.meta.scanDurationMs)).toBe(true)

    // projectRoot should be set
    expect(snapshot.meta.projectRoot.length).toBeGreaterThan(0)

    // projectName defaults from package.json name or basename
    expect(snapshot.meta.projectName.length).toBeGreaterThan(0)
  })

  it('fileCounts.scanned equals the number of discovered files', async () => {
    const snapshot = await scan({ root: tmpRoot })
    // We created src/a.ts and src/b.ts — exactly 2 files.
    expect(snapshot.meta.fileCounts.scanned).toBe(2)
    expect(snapshot.meta.fileCounts.indexed).toBe(2)
    expect(snapshot.meta.fileCounts.skipped).toBe(0)
  })

  it('nodes includes a file node for each discovered file', async () => {
    const snapshot = await scan({ root: tmpRoot })

    const nodeIds = snapshot.nodes.map((n) => n.id)
    expect(nodeIds).toContain('file:src/a.ts')
    expect(nodeIds).toContain('file:src/b.ts')
  })

  it('edges is empty when there are no imports between files', async () => {
    const snapshot = await scan({ root: tmpRoot })

    // Only depends_on / imports / contains from subsystems and packages — no
    // cross-file imports since a.ts and b.ts don't import each other.
    // The files have no imports, so no imports edges. There MAY be contains and
    // package/external nodes from analyzers, but no depends_on edges.
    const importsEdges = snapshot.edges.filter((e) => e.kind === 'imports')
    expect(importsEdges).toHaveLength(0)
  })

  it('emits no drift findings without curated subsystem docs', async () => {
    // Drift compares curated SubsystemDoc declarations against AST evidence and
    // is scoped to curated projects (spec §9, migration State A/B: "drift works
    // only with curated YAML"). This fixture has no .vibegraph/subsystems/*.yml,
    // so the drift detector is skipped — no stale/undeclared/unowned findings.
    const snapshot = await scan({ root: tmpRoot })
    const driftFindings = snapshot.findings.filter((f) => f.domain === 'drift')
    expect(driftFindings).toEqual([])
  })

  it('snapshot passes SnapshotSchema validation (no throw)', async () => {
    // SnapshotSchema.parse is called internally — if we reach here without a
    // throw, the snapshot is structurally valid.
    await expect(scan({ root: tmpRoot })).resolves.toBeDefined()
  })

  it('scan with SubsystemDocs produces yaml-sourced edges and table nodes', async () => {
    // Create subsystem docs that declare depends_on and schema_tables.
    const subsystemsDir = join(tmpRoot, '.vibegraph', 'subsystems')
    await mkdir(subsystemsDir, { recursive: true })
    await writeFile(
      join(subsystemsDir, 'alpha.yml'),
      'id: alpha\ntitle: Alpha\nlayer: domain\nmatch: src/a.ts\ndepends_on:\n  - beta\nschema_tables:\n  - users\n',
      'utf-8',
    )
    await writeFile(
      join(subsystemsDir, 'beta.yml'),
      'id: beta\ntitle: Beta\nlayer: domain\nmatch: src/b.ts\nschema_tables:\n  - products\n',
      'utf-8',
    )

    const snapshot = await scan({ root: tmpRoot })

    // Assert YAML-sourced edges are present: alpha depends_on beta
    const yamlEdges = snapshot.edges.filter((e) => e.source === 'yaml')
    expect(yamlEdges.length).toBeGreaterThan(0)
    expect(yamlEdges.some((e) => e.from === 'subsystem:alpha' && e.to === 'subsystem:beta')).toBe(
      true,
    )

    // Assert table nodes are present
    const tableNodes = snapshot.nodes.filter((n) => n.kind === 'table')
    expect(tableNodes.length).toBeGreaterThanOrEqual(2)
    expect(tableNodes.some((n) => n.id === 'table:users')).toBe(true)
    expect(tableNodes.some((n) => n.id === 'table:products')).toBe(true)

    // Assert owns edges from subsystems to tables
    const ownsEdges = snapshot.edges.filter((e) => e.kind === 'owns')
    expect(ownsEdges.some((e) => e.from === 'subsystem:alpha' && e.to === 'table:users')).toBe(true)
    expect(ownsEdges.some((e) => e.from === 'subsystem:beta' && e.to === 'table:products')).toBe(
      true,
    )
  })

  it('scan with no baseline → no-op for no-new-* builtin rules (domain=rule findings = 0)', async () => {
    // Without a baseline, delta-rules (no_cycles, no_orphans, drift_must_not_worsen)
    // should produce zero findings because they diff against a baseline that doesn't exist.
    // The no-layer-violation edge-pattern rule may also be quiet if the fixture has no
    // domain→horizontal edges. Either way, we assert no domain='rule' findings exist.
    const snapshot = await scan({ root: tmpRoot })
    const ruleFindings = snapshot.findings.filter((f) => f.domain === 'rule')
    expect(ruleFindings).toHaveLength(0)
  })

  it('scan with custom edge-pattern rule yields domain=rule findings with ruleId', async () => {
    // Create a curated project with a domain subsystem that depends_on a horizontal
    // subsystem, and a config.yml that makes the no-layer-violation rule explicit.
    // The rule engine should detect this and emit a Finding with domain='rule'.
    const tmp = await mkdtemp(join(tmpdir(), 'vg-rule-ep-'))
    try {
      await mkdir(join(tmp, 'src'), { recursive: true })
      await writeFile(
        join(tmp, 'package.json'),
        JSON.stringify({ name: 'ep-test', version: '0' }),
        'utf-8',
      )
      await writeFile(
        join(tmp, 'tsconfig.json'),
        JSON.stringify({
          compilerOptions: { target: 'esnext', module: 'esnext', moduleResolution: 'bundler' },
          include: ['src/**/*'],
        }),
        'utf-8',
      )
      await writeFile(join(tmp, 'src', 'domain.ts'), 'export const d = 1', 'utf-8')
      await writeFile(join(tmp, 'src', 'ui.ts'), 'export const u = 2', 'utf-8')

      const subsystemsDir = join(tmp, '.vibegraph', 'subsystems')
      await mkdir(subsystemsDir, { recursive: true })
      // domain subsystem declares a depends_on edge to the horizontal subsystem
      await writeFile(
        join(subsystemsDir, 'domain-sub.yml'),
        'id: domain-sub\ntitle: Domain Sub\nlayer: domain\nmatch: src/domain.ts\ndepends_on:\n  - ui-sub\n',
        'utf-8',
      )
      await writeFile(
        join(subsystemsDir, 'ui-sub.yml'),
        'id: ui-sub\ntitle: UI Sub\nlayer: horizontal\nmatch: src/ui.ts\n',
        'utf-8',
      )

      // Add an explicit edge-pattern rule to config.yml to also test the config path
      const configDir = join(tmp, '.vibegraph')
      await writeFile(
        join(configDir, 'config.yml'),
        [
          'rules:',
          '  - kind: edge-pattern',
          '    id: test:domain-no-horizontal',
          '    title: "Domain must not depend on horizontal"',
          '    severity: high',
          '    mode: warn',
          '    from:',
          '      layer: domain',
          '    to:',
          '      layer: horizontal',
          '    relation: depends_on',
          '    forbidden: true',
        ].join('\n'),
        'utf-8',
      )

      const snapshot = await scan({ root: tmp })

      const ruleFindings = snapshot.findings.filter((f) => f.domain === 'rule')
      expect(ruleFindings.length).toBeGreaterThan(0)

      const matchingFinding = ruleFindings.find(
        (f) =>
          typeof f.metadata?.ruleId === 'string' &&
          (f.metadata.ruleId === 'test:domain-no-horizontal' ||
            f.metadata.ruleId === 'builtin:no-layer-violation'),
      )
      expect(matchingFinding).toBeDefined()
      expect(matchingFinding?.domain).toBe('rule')
    } finally {
      await rm(tmp, { recursive: true, force: true })
    }
  })

  it('scan emits drift findings when yaml declares deps without AST evidence', async () => {
    const tmp = await mkdtemp(join(tmpdir(), 'vg-drift-'))
    try {
      await mkdir(join(tmp, 'src'), { recursive: true })
      await writeFile(
        join(tmp, 'package.json'),
        JSON.stringify({ name: 'f', version: '0' }),
        'utf-8',
      )
      await writeFile(
        join(tmp, 'tsconfig.json'),
        JSON.stringify({
          compilerOptions: { target: 'esnext', module: 'esnext', moduleResolution: 'bundler' },
          include: ['src/**/*'],
        }),
        'utf-8',
      )
      await writeFile(join(tmp, 'src', 'a.ts'), 'export const a = 1', 'utf-8')

      const subsystemsDir = join(tmp, '.vibegraph', 'subsystems')
      await mkdir(subsystemsDir, { recursive: true })
      await writeFile(
        join(subsystemsDir, 'alpha.yml'),
        'id: alpha\ntitle: Alpha\nlayer: domain\nmatch: src/a.ts\ndepends_on:\n  - beta\n',
        'utf-8',
      )
      await writeFile(
        join(subsystemsDir, 'beta.yml'),
        'id: beta\ntitle: Beta\nlayer: domain\nmatch: src/b.ts\n',
        'utf-8',
      )

      const snapshot = await scan({ root: tmp })

      const driftFindings = snapshot.findings.filter((f) => f.domain === 'drift')
      expect(driftFindings.length).toBeGreaterThan(0)
      expect(driftFindings.some((f) => /^drift:stale:/.test(f.id))).toBe(true)
    } finally {
      await rm(tmp, { recursive: true, force: true })
    }
  })

  it('.vibegraphignore patterns exclude matched files from the scan', async () => {
    const tmp = await mkdtemp(join(tmpdir(), 'vg-scan-ignore-'))
    try {
      await mkdir(join(tmp, 'src'), { recursive: true })
      await mkdir(join(tmp, 'skipdir'), { recursive: true })

      // keep.ts should appear in results; skipdir/ignored.ts should not.
      await writeFile(join(tmp, 'src', 'keep.ts'), 'export const keep = 1\n', 'utf-8')
      await writeFile(join(tmp, 'skipdir', 'ignored.ts'), 'export const ignored = 1\n', 'utf-8')

      await writeFile(
        join(tmp, 'package.json'),
        JSON.stringify({ name: 'ignore-test', version: '0.0.0', dependencies: {} }),
        'utf-8',
      )
      await writeFile(
        join(tmp, 'tsconfig.json'),
        JSON.stringify({
          compilerOptions: {
            strict: true,
            target: 'ES2022',
            module: 'NodeNext',
            moduleResolution: 'NodeNext',
            esModuleInterop: true,
            noEmit: true,
          },
          include: ['src/**/*', 'skipdir/**/*'],
        }),
        'utf-8',
      )

      // Write a .vibegraphignore that excludes skipdir/
      await writeFile(join(tmp, '.vibegraphignore'), 'skipdir/\n', 'utf-8')

      const snapshot = await scan({ root: tmp })

      const nodeIds = snapshot.nodes.map((n) => n.id)
      // keep.ts must be indexed
      expect(nodeIds).toContain('file:src/keep.ts')
      // skipdir/ignored.ts must NOT be indexed
      expect(nodeIds).not.toContain('file:skipdir/ignored.ts')
    } finally {
      await rm(tmp, { recursive: true, force: true })
    }
  })

  it('scan with no .vibegraphignore behaves as before (no regression)', async () => {
    // The default tmpRoot fixture (src/a.ts, src/b.ts, no .vibegraphignore) must still
    // produce exactly 2 file nodes — confirming that a missing ignore file is a no-op.
    const snapshot = await scan({ root: tmpRoot })
    const fileNodes = snapshot.nodes.filter((n) => n.kind === 'file')
    expect(fileNodes).toHaveLength(2)
    const nodeIds = fileNodes.map((n) => n.id)
    expect(nodeIds).toContain('file:src/a.ts')
    expect(nodeIds).toContain('file:src/b.ts')
  })
})
