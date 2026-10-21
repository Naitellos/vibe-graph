import assert from 'node:assert'
import { mkdirSync, mkdtempSync, realpathSync, writeFileSync } from 'node:fs'
import { tmpdir } from 'node:os'
import { dirname, join } from 'node:path'
import { pino } from 'pino'
import type { Logger } from 'pino'
import { describe, expect, it, vi } from 'vitest'
import { DEFAULT_CONFIG, type VibegraphConfig } from '../config/config-yml.js'
import type { SubsystemDoc } from '../schema/subsystem-doc.js'
import { coreSubsystemsAnalyzer } from './core-subsystems.js'
import { createIgnoreMatcher } from './ignore-matcher.js'
import type { ProgramManager } from './program-manager.js'

function mkTmp(): string {
  return realpathSync(mkdtempSync(join(tmpdir(), 'vg-core-subsystems-')))
}

function touch(root: string, relPath: string, body = '') {
  const abs = join(root, relPath)
  mkdirSync(dirname(abs), { recursive: true })
  writeFileSync(abs, body)
}

function makeCtx(
  root: string,
  files: string[] = [],
  config: VibegraphConfig = DEFAULT_CONFIG,
  subsystemDocs: SubsystemDoc[] = [],
  log?: Logger,
) {
  const programs: ProgramManager = {
    getProgramForFile: () => ({}) as never,
    getAllPrograms: () => [],
  }
  const ignore = createIgnoreMatcher({ patterns: [], includeDefaults: false })
  const finalLog = log ?? pino({ level: 'silent' })
  return { projectRoot: root, files, programs, ignore, log: finalLog, config, subsystemDocs }
}

describe('coreSubsystemsAnalyzer', () => {
  it('has correct id and description', () => {
    expect(coreSubsystemsAnalyzer.id).toBe('core/subsystems')
    expect(typeof coreSubsystemsAnalyzer.description).toBe('string')
    expect(coreSubsystemsAnalyzer.description.length).toBeGreaterThan(0)
  })

  it('Test 1 — monorepo fixture: detects subsystems from workspaces and emits contains edges', async () => {
    const root = mkTmp()

    // Root package.json with workspaces
    touch(root, 'package.json', JSON.stringify({ name: 'mono', workspaces: ['packages/*'] }))

    // Workspace A
    touch(root, 'packages/a/package.json', JSON.stringify({ name: '@org/a' }))
    touch(root, 'packages/a/src/index.ts', '')

    // Workspace B
    touch(root, 'packages/b/package.json', JSON.stringify({ name: '@org/b' }))
    touch(root, 'packages/b/src/handler.ts', '')

    const fileA = join(root, 'packages/a/src/index.ts')
    const fileB = join(root, 'packages/b/src/handler.ts')

    const result = await coreSubsystemsAnalyzer.run(makeCtx(root, [fileA, fileB]))

    // 2 subsystem nodes
    expect(result.nodes).toHaveLength(2)
    const nodeA = result.nodes.find((n) => n.id === 'subsystem:@org/a')
    expect(nodeA).toBeDefined()
    expect(nodeA?.kind).toBe('subsystem')
    expect(nodeA?.title).toBe('@org/a')

    const nodeB = result.nodes.find((n) => n.id === 'subsystem:@org/b')
    expect(nodeB).toBeDefined()
    expect(nodeB?.kind).toBe('subsystem')
    expect(nodeB?.title).toBe('@org/b')

    // 2 contains edges (one per file)
    expect(result.edges).toHaveLength(2)

    const edgeA = result.edges.find((e) => e.to === 'file:packages/a/src/index.ts')
    expect(edgeA).toBeDefined()
    expect(edgeA?.from).toBe('subsystem:@org/a')
    expect(edgeA?.kind).toBe('contains')
    expect(edgeA?.source).toBe('derived')

    const edgeB = result.edges.find((e) => e.to === 'file:packages/b/src/handler.ts')
    expect(edgeB).toBeDefined()
    expect(edgeB?.from).toBe('subsystem:@org/b')
    expect(edgeB?.kind).toBe('contains')
    expect(edgeB?.source).toBe('derived')

    // No evidence for derived data
    expect(result.evidence).toEqual([])
  })

  it('Test 2 — flat fixture: detects subsystems from top-level src/ subdirs', async () => {
    const root = mkTmp()

    // Create flat project with src/ subdirs
    touch(root, 'src/auth/login.ts', '')
    touch(root, 'src/auth/logout.ts', '')
    touch(root, 'src/billing/charge.ts', '')
    touch(root, 'src/index.ts', '') // top-level — NOT under a subsystem

    const fileLogin = join(root, 'src/auth/login.ts')
    const fileLogout = join(root, 'src/auth/logout.ts')
    const fileCharge = join(root, 'src/billing/charge.ts')
    const fileIndex = join(root, 'src/index.ts')

    const result = await coreSubsystemsAnalyzer.run(
      makeCtx(root, [fileLogin, fileLogout, fileCharge, fileIndex]),
    )

    // 2 subsystem nodes (auth + billing)
    expect(result.nodes).toHaveLength(2)
    const nodeAuth = result.nodes.find((n) => n.id === 'subsystem:auth')
    expect(nodeAuth).toBeDefined()
    expect(nodeAuth?.kind).toBe('subsystem')
    expect(nodeAuth?.title).toBe('auth')

    const nodeBilling = result.nodes.find((n) => n.id === 'subsystem:billing')
    expect(nodeBilling).toBeDefined()
    expect(nodeBilling?.kind).toBe('subsystem')
    expect(nodeBilling?.title).toBe('billing')

    // 3 contains edges (login + logout + charge; index.ts excluded)
    expect(result.edges).toHaveLength(3)

    const authEdges = result.edges.filter((e) => e.from === 'subsystem:auth')
    expect(authEdges).toHaveLength(2)

    const billingEdges = result.edges.filter((e) => e.from === 'subsystem:billing')
    expect(billingEdges).toHaveLength(1)

    // src/index.ts should NOT have a contains edge
    expect(result.edges.find((e) => e.to === 'file:src/index.ts')).toBeUndefined()

    // No evidence
    expect(result.evidence).toEqual([])
  })

  it('Test 3 — empty result: no src/ dir, no workspaces → no subsystems', async () => {
    const root = mkTmp()
    // No package.json with workspaces, no src/
    const result = await coreSubsystemsAnalyzer.run(makeCtx(root, []))

    expect(result.nodes).toHaveLength(0)
    expect(result.edges).toHaveLength(0)
    expect(result.evidence).toEqual([])
  })

  it('edge shape: contains edge has all required fields', async () => {
    const root = mkTmp()
    touch(root, 'src/auth/login.ts', '')
    const fileLogin = join(root, 'src/auth/login.ts')

    const result = await coreSubsystemsAnalyzer.run(makeCtx(root, [fileLogin]))

    expect(result.edges).toHaveLength(1)
    const edge = result.edges[0]
    assert(edge !== undefined)
    expect(edge.id).toBe('subsystem:auth->file:src/auth/login.ts:contains')
    expect(edge.from).toBe('subsystem:auth')
    expect(edge.to).toBe('file:src/auth/login.ts')
    expect(edge.kind).toBe('contains')
    expect(edge.category).toBe('structural')
    expect(edge.source).toBe('derived')
    expect(edge.confidence).toBe('high')
    expect(edge.evidenceIds).toEqual([])
    expect(edge.weight).toBe(1)
    expect(edge.runtimeWeight).toBe(0)
    expect(edge.typeOnlyWeight).toBe(0)
    expect(edge.dynamicWeight).toBe(0)
    expect(edge.metadata).toEqual({})
  })

  it('Test 5 — manual mode: only manual subsystems, unmatched files have no contains edge', async () => {
    const root = mkTmp()
    touch(root, 'src/auth/login.ts', '')
    touch(root, 'src/billing/charge.ts', '')
    touch(root, 'src/other/util.ts', '')

    const fileLogin = join(root, 'src/auth/login.ts')
    const fileCharge = join(root, 'src/billing/charge.ts')
    const fileUtil = join(root, 'src/other/util.ts')

    const config: VibegraphConfig = {
      project: { root: '.' },
      subsystemDetection: { mode: 'manual' },
      subsystems: [
        { id: 'auth', title: 'Authentication', match: ['src/auth/**'] },
        { id: 'payments', title: 'Payments', match: ['src/billing/**'] },
      ],
      detectors: {},
    }

    const result = await coreSubsystemsAnalyzer.run(
      makeCtx(root, [fileLogin, fileCharge, fileUtil], config),
    )

    // 2 subsystem nodes — manual only
    expect(result.nodes).toHaveLength(2)
    expect(result.nodes.find((n) => n.id === 'subsystem:auth')).toBeDefined()
    expect(result.nodes.find((n) => n.id === 'subsystem:payments')).toBeDefined()

    // 2 contains edges (login → auth, charge → payments)
    expect(result.edges).toHaveLength(2)
    const edgeLogin = result.edges.find((e) => e.to === 'file:src/auth/login.ts')
    expect(edgeLogin).toBeDefined()
    expect(edgeLogin?.from).toBe('subsystem:auth')

    const edgeCharge = result.edges.find((e) => e.to === 'file:src/billing/charge.ts')
    expect(edgeCharge).toBeDefined()
    expect(edgeCharge?.from).toBe('subsystem:payments')

    // util.ts has no contains edge (no manual rule matched, manual mode = no auto fallback)
    expect(result.edges.find((e) => e.to === 'file:src/other/util.ts')).toBeUndefined()

    // No evidence
    expect(result.evidence).toEqual([])
  })

  it('Test 6 — hybrid mode: manual overrides, auto fills unmatched', async () => {
    const root = mkTmp()
    touch(root, 'src/auth/login.ts', '')
    touch(root, 'src/billing/charge.ts', '')
    touch(root, 'src/other/util.ts', '')

    const fileLogin = join(root, 'src/auth/login.ts')
    const fileCharge = join(root, 'src/billing/charge.ts')
    const fileUtil = join(root, 'src/other/util.ts')

    const config: VibegraphConfig = {
      project: { root: '.' },
      subsystemDetection: { mode: 'hybrid' },
      subsystems: [{ id: 'auth', title: 'Auth', match: ['src/auth/**'] }],
      detectors: {},
    }

    const result = await coreSubsystemsAnalyzer.run(
      makeCtx(root, [fileLogin, fileCharge, fileUtil], config),
    )

    // 3 subsystem nodes: subsystem:auth (manual), subsystem:billing (auto), subsystem:other (auto)
    expect(result.nodes).toHaveLength(3)
    expect(result.nodes.find((n) => n.id === 'subsystem:auth')).toBeDefined()
    expect(result.nodes.find((n) => n.id === 'subsystem:billing')).toBeDefined()
    expect(result.nodes.find((n) => n.id === 'subsystem:other')).toBeDefined()

    // login → auth (manual)
    const edgeLogin = result.edges.find((e) => e.to === 'file:src/auth/login.ts')
    expect(edgeLogin).toBeDefined()
    expect(edgeLogin?.from).toBe('subsystem:auth')

    // charge → billing (auto)
    const edgeCharge = result.edges.find((e) => e.to === 'file:src/billing/charge.ts')
    expect(edgeCharge).toBeDefined()
    expect(edgeCharge?.from).toBe('subsystem:billing')

    // util → other (auto)
    const edgeUtil = result.edges.find((e) => e.to === 'file:src/other/util.ts')
    expect(edgeUtil).toBeDefined()
    expect(edgeUtil?.from).toBe('subsystem:other')

    expect(result.evidence).toEqual([])
  })

  it('Test 7 — conflict: manual overrides auto when ids collide', async () => {
    const root = mkTmp()
    touch(root, 'src/auth/login.ts', '')
    touch(root, 'src/auth/logout.ts', '')

    const fileLogin = join(root, 'src/auth/login.ts')
    const fileLogout = join(root, 'src/auth/logout.ts')

    const config: VibegraphConfig = {
      project: { root: '.' },
      subsystemDetection: { mode: 'hybrid' },
      subsystems: [{ id: 'auth', title: 'Custom Auth', match: ['src/auth/**'] }],
      detectors: {},
    }

    const result = await coreSubsystemsAnalyzer.run(makeCtx(root, [fileLogin, fileLogout], config))

    // 1 subsystem node — manual wins, auto sub with same id NOT emitted
    expect(result.nodes).toHaveLength(1)
    const authNode = result.nodes.find((n) => n.id === 'subsystem:auth')
    expect(authNode).toBeDefined()
    expect(authNode?.title).toBe('Custom Auth') // manual title, not auto-derived 'auth'

    // Both files contained in manual auth
    expect(result.edges).toHaveLength(2)
    expect(result.edges.every((e) => e.from === 'subsystem:auth')).toBe(true)

    expect(result.evidence).toEqual([])
  })

  it('Test 8 — declaration order: first matching manual rule wins', async () => {
    const root = mkTmp()
    touch(root, 'src/shared/util.ts', '')
    const fileUtil = join(root, 'src/shared/util.ts')

    const config: VibegraphConfig = {
      project: { root: '.' },
      subsystemDetection: { mode: 'manual' },
      subsystems: [
        { id: 'first', title: 'First', match: ['src/shared/**'] },
        { id: 'second', title: 'Second', match: ['src/**'] }, // broader, declared second
      ],
      detectors: {},
    }

    const result = await coreSubsystemsAnalyzer.run(makeCtx(root, [fileUtil], config))

    // util.ts should be contained in 'first' (declaration order wins)
    expect(result.edges).toHaveLength(1)
    const edge = result.edges[0]
    expect(edge?.from).toBe('subsystem:first')
    expect(edge?.to).toBe('file:src/shared/util.ts')

    expect(result.evidence).toEqual([])
  })

  it('uses SubsystemDocs when present (skips auto-detect)', async () => {
    const root = mkTmp()
    touch(root, 'server/services/payment.ts', '')
    touch(root, 'client/app.tsx', '')

    const filePayment = join(root, 'server/services/payment.ts')
    const fileApp = join(root, 'client/app.tsx')

    const subsystemDocs: SubsystemDoc[] = [
      {
        id: 'payments',
        title: 'Payments',
        layer: 'domain',
        status: 'shipped',
        description: '',
        match: ['server/services/payment.ts'],
        depends_on: [],
        consumed_by: [],
        schema_tables: [],
        related_specs: [],
        related_decisions: [],
        memory_refs: [],
      },
    ]

    const result = await coreSubsystemsAnalyzer.run(
      makeCtx(root, [filePayment, fileApp], DEFAULT_CONFIG, subsystemDocs),
    )

    // Only payments subsystem from docs, not auto-detected client
    expect(result.nodes.find((n) => n.id === 'subsystem:payments')).toBeDefined()
    expect(result.nodes.find((n) => n.id.startsWith('subsystem:client'))).toBeUndefined()

    // payment.ts is contained in payments, app.tsx is not in any subsystem
    const edgePayment = result.edges.find((e) => e.to === 'file:server/services/payment.ts')
    expect(edgePayment).toBeDefined()
    expect(edgePayment?.from).toBe('subsystem:payments')

    const edgeApp = result.edges.find((e) => e.to === 'file:client/app.tsx')
    expect(edgeApp).toBeUndefined()
  })

  // ─── UX5: doc.status carried onto Node ──────────────────────────────────────

  it('UX5 — subsystem doc with status="shipped" produces a Node with status="shipped" (not "unknown")', async () => {
    const root = mkTmp()
    touch(root, 'src/billing/charge.ts', '')
    const fileBilling = join(root, 'src/billing/charge.ts')

    const subsystemDocs: SubsystemDoc[] = [
      {
        id: 'billing',
        title: 'Billing',
        layer: 'domain',
        status: 'shipped',
        description: '',
        match: ['src/billing/**'],
        depends_on: [],
        consumed_by: [],
        schema_tables: [],
        related_specs: [],
        related_decisions: [],
        memory_refs: [],
      },
    ]

    const result = await coreSubsystemsAnalyzer.run(
      makeCtx(root, [fileBilling], DEFAULT_CONFIG, subsystemDocs),
    )

    const billingNode = result.nodes.find((n) => n.id === 'subsystem:billing')
    expect(billingNode).toBeDefined()
    // UX5: status from doc must be carried through — NOT overridden with 'unknown'
    expect(billingNode?.status).toBe('shipped')
  })

  it('UX5 — subsystem doc with status="in-progress" produces a Node with status="in-progress"', async () => {
    const root = mkTmp()

    const subsystemDocs: SubsystemDoc[] = [
      {
        id: 'analytics',
        title: 'Analytics',
        layer: 'infrastructure',
        status: 'in-progress',
        description: '',
        match: ['src/analytics/**'],
        depends_on: [],
        consumed_by: [],
        schema_tables: [],
        related_specs: [],
        related_decisions: [],
        memory_refs: [],
      },
    ]

    const result = await coreSubsystemsAnalyzer.run(
      makeCtx(root, [], DEFAULT_CONFIG, subsystemDocs),
    )

    const analyticsNode = result.nodes.find((n) => n.id === 'subsystem:analytics')
    expect(analyticsNode).toBeDefined()
    expect(analyticsNode?.status).toBe('in-progress')
  })

  it('UX5 — auto-detected subsystem (no doc) still defaults to status="unknown"', async () => {
    const root = mkTmp()
    touch(root, 'src/payments/tx.ts', '')
    const fileTx = join(root, 'src/payments/tx.ts')

    // No subsystemDocs — auto-detect path
    const result = await coreSubsystemsAnalyzer.run(makeCtx(root, [fileTx]))

    const paymentsNode = result.nodes.find((n) => n.id === 'subsystem:payments')
    expect(paymentsNode).toBeDefined()
    expect(paymentsNode?.status).toBe('unknown')
  })

  it('top-level source dirs: detects subsystems + layers (no workspaces, no src/)', async () => {
    const root = mkTmp()
    touch(root, 'package.json', JSON.stringify({ name: 'app' })) // NO workspaces
    for (const f of ['server/index.ts', 'server/routes.ts', 'server/db.ts']) touch(root, f)
    for (const f of ['client/main.tsx', 'client/app.tsx', 'client/ui.tsx']) touch(root, f)
    for (const f of ['shared/types.ts', 'shared/util.ts', 'shared/const.ts']) touch(root, f)
    for (const f of ['docs/a.ts', 'docs/b.ts', 'docs/c.ts']) touch(root, f) // non-code name → excluded
    touch(root, 'widgets/one.ts') // below threshold (1 file) → excluded
    touch(root, 'rootfile.ts') // root-level file (no parent dir) → excluded

    const rel = [
      'server/index.ts',
      'server/routes.ts',
      'server/db.ts',
      'client/main.tsx',
      'client/app.tsx',
      'client/ui.tsx',
      'shared/types.ts',
      'shared/util.ts',
      'shared/const.ts',
      'docs/a.ts',
      'docs/b.ts',
      'docs/c.ts',
      'widgets/one.ts',
    ]
    const files = [...rel.map((p) => join(root, p)), join(root, 'rootfile.ts')]
    const result = await coreSubsystemsAnalyzer.run(makeCtx(root, files))

    const subs = new Map(result.nodes.filter((n) => n.kind === 'subsystem').map((n) => [n.id, n]))
    expect(subs.has('subsystem:server')).toBe(true)
    expect(subs.has('subsystem:client')).toBe(true)
    expect(subs.has('subsystem:shared')).toBe(true)
    expect(subs.has('subsystem:docs')).toBe(false) // non-code dir name
    expect(subs.has('subsystem:widgets')).toBe(false) // below MIN_FILES
    expect(subs.has('subsystem:rootfile')).toBe(false) // root-level file (seg === rel guard)

    expect(subs.get('subsystem:server')?.layer).toBe('domain')
    expect(subs.get('subsystem:client')?.layer).toBe('horizontal')
    expect(subs.get('subsystem:shared')?.layer).toBe('unknown')
    expect(subs.get('subsystem:server')?.metadata.autoDetected).toBe(true)

    const containsServer = result.edges.find(
      (e) => e.kind === 'contains' && e.to === 'file:server/index.ts',
    )
    expect(containsServer?.from).toBe('subsystem:server')
  })

  it('warns when both inline config.subsystems and SubsystemDocs present', async () => {
    const root = mkTmp()
    const warnSpy = vi.fn()
    const testLog = {
      warn: warnSpy,
      info: () => {},
      error: () => {},
      debug: () => {},
    } as unknown as Logger

    const config: VibegraphConfig = {
      project: { root: '.' },
      subsystemDetection: { mode: 'hybrid' },
      subsystems: [{ id: 'legacy', title: 'Legacy', match: ['l/**'] }],
      detectors: {},
    }

    const subsystemDocs: SubsystemDoc[] = [
      {
        id: 'rich',
        title: 'Rich',
        layer: 'domain',
        status: 'unknown',
        description: '',
        match: ['src/**'],
        depends_on: [],
        consumed_by: [],
        schema_tables: [],
        related_specs: [],
        related_decisions: [],
        memory_refs: [],
      },
    ]

    await coreSubsystemsAnalyzer.run(makeCtx(root, [], config, subsystemDocs, testLog))

    expect(warnSpy).toHaveBeenCalledWith(expect.stringMatching(/shadowed by/i))
  })

  it('resolves a literal workspace entry to that directory only, not its subdirectories', async () => {
    const root = mkTmp()
    touch(root, 'package.json', JSON.stringify({ name: 'mono', workspaces: ['tools'] }))
    touch(root, 'tools/package.json', JSON.stringify({ name: 'tools' }))
    touch(root, 'tools/fixtures/demo/package.json', JSON.stringify({ name: 'demo-fixture' }))
    touch(root, 'tools/fixtures/demo/index.ts', '')
    const fileDemo = join(root, 'tools/fixtures/demo/index.ts')

    const result = await coreSubsystemsAnalyzer.run(makeCtx(root, [fileDemo]))

    expect(result.nodes.map((n) => n.id)).toEqual(['subsystem:tools'])
    expect(result.edges.map((e) => `${e.from} ${e.to}`)).toEqual([
      'subsystem:tools file:tools/fixtures/demo/index.ts',
    ])
  })

  it('manual match globs: braces, ranges, extglobs, ** depth, no dotfiles, case-sensitive, no basename matching', async () => {
    const root = mkTmp()
    const rels = [
      'src/auth/login.ts',
      'src/billing/charge.ts',
      'api/v1/a.ts',
      'api/v2/b.ts',
      'api/v3/c.ts',
      'pkg/a/x.ts',
      'pkg/c/x.ts',
      'src/main.ts',
      'lib/deep/util.test.ts',
      '.github/ci.test.ts',
      'root.ts',
      'lib/x.ts',
      'src/ui/button.ts',
      'src/.hidden/secret.ts',
      'src/.env.ts',
    ]
    for (const rel of rels) touch(root, rel, '')

    const config: VibegraphConfig = {
      project: { root: '.' },
      subsystemDetection: { mode: 'manual' },
      subsystems: [
        { id: 'brace', title: 'brace', match: ['src/{auth,billing}/**'] },
        { id: 'range', title: 'range', match: ['api/v{1..2}/**'] },
        { id: 'extglob', title: 'extglob', match: ['pkg/@(a|b)/**'] },
        { id: 'toplevel', title: 'toplevel', match: ['src/*.ts'] },
        { id: 'tests', title: 'tests', match: ['**/*.test.ts'] },
        { id: 'upper', title: 'upper', match: ['src/UI/**'] },
        { id: 'bare', title: 'bare', match: ['*.ts'] },
        { id: 'srcall', title: 'srcall', match: ['src/**'] },
      ],
      detectors: {},
    }

    const files = rels.map((rel) => join(root, rel))
    const result = await coreSubsystemsAnalyzer.run(makeCtx(root, files, config))

    const owner = new Map(result.edges.map((e) => [e.to.slice('file:'.length), e.from]))
    expect(Object.fromEntries(rels.map((rel) => [rel, owner.get(rel) ?? null]))).toEqual({
      'src/auth/login.ts': 'subsystem:brace',
      'src/billing/charge.ts': 'subsystem:brace',
      'api/v1/a.ts': 'subsystem:range',
      'api/v2/b.ts': 'subsystem:range',
      'api/v3/c.ts': null,
      'pkg/a/x.ts': 'subsystem:extglob',
      'pkg/c/x.ts': null,
      'src/main.ts': 'subsystem:toplevel',
      'lib/deep/util.test.ts': 'subsystem:tests',
      '.github/ci.test.ts': null,
      'root.ts': 'subsystem:bare',
      'lib/x.ts': null,
      'src/ui/button.ts': 'subsystem:srcall',
      'src/.hidden/secret.ts': null,
      'src/.env.ts': null,
    })
  })

  it('manual match arrays are any-of: a "!" entry does not subtract from the others', async () => {
    const root = mkTmp()
    touch(root, 'vendor/internal/x.ts', '')
    touch(root, 'app/y.ts', '')
    const files = [join(root, 'vendor/internal/x.ts'), join(root, 'app/y.ts')]

    const config: VibegraphConfig = {
      project: { root: '.' },
      subsystemDetection: { mode: 'manual' },
      subsystems: [{ id: 'vendor', title: 'vendor', match: ['vendor/**', '!vendor/internal/**'] }],
      detectors: {},
    }

    const result = await coreSubsystemsAnalyzer.run(makeCtx(root, files, config))

    expect(result.edges.map((e) => e.to).sort()).toEqual([
      'file:app/y.ts',
      'file:vendor/internal/x.ts',
    ])
  })
})
