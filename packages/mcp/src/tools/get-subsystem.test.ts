import { SnapshotSchema, buildLoadedSnapshot } from '@codearch/core'
import { describe, expect, it } from 'vitest'
import { ToolError } from '../errors.js'
import { GetSubsystemTool, buildSubsystem } from './get-subsystem.js'

const makeSnap = () =>
  SnapshotSchema.parse({
    meta: {
      schemaVersion: '0.1.0',
      scanId: '11111111-1111-4111-8111-111111111111',
      builtAt: '2026-05-25T00:00:00.000Z',
      projectRoot: '/abs',
      projectName: 'demo',
      vibegraphVersion: '0.0.0',
      scanDurationMs: 1,
      fileCounts: { scanned: 3, indexed: 3, skipped: 0 },
    },
    nodes: [
      { id: 'subsystem:auth', kind: 'subsystem', title: 'Auth', layer: 'domain' },
      { id: 'subsystem:shared', kind: 'subsystem', title: 'Shared', layer: 'horizontal' },
      { id: 'subsystem:billing', kind: 'subsystem', title: 'Billing' },
      { id: 'file:src/auth/login.ts', kind: 'file', title: 'login.ts' },
      { id: 'file:src/auth/logout.ts', kind: 'file', title: 'logout.ts' },
    ],
    edges: [
      // auth → shared (depends_on)
      {
        id: 'e1',
        from: 'subsystem:auth',
        to: 'subsystem:shared',
        kind: 'depends_on',
        source: 'derived',
        confidence: 'high',
        evidenceIds: ['ev1'],
        runtimeWeight: 2,
        typeOnlyWeight: 0,
        dynamicWeight: 0,
        weight: 2,
      },
      // billing → auth (depends_on) — consumedBy(auth)
      {
        id: 'e2',
        from: 'subsystem:billing',
        to: 'subsystem:auth',
        kind: 'depends_on',
        source: 'derived',
        confidence: 'medium',
        evidenceIds: ['ev2'],
        runtimeWeight: 1,
        typeOnlyWeight: 1,
        dynamicWeight: 0,
        weight: 2,
      },
      // contains: auth → login, logout
      {
        id: 'c1',
        from: 'subsystem:auth',
        to: 'file:src/auth/login.ts',
        kind: 'contains',
        source: 'derived',
        confidence: 'high',
      },
      {
        id: 'c2',
        from: 'subsystem:auth',
        to: 'file:src/auth/logout.ts',
        kind: 'contains',
        source: 'derived',
        confidence: 'high',
      },
      // file imports — for importCount on login.ts
      {
        id: 'i1',
        from: 'file:src/auth/login.ts',
        to: 'file:src/auth/logout.ts',
        kind: 'imports',
        source: 'ast',
        confidence: 'high',
      },
    ],
    evidence: [
      {
        id: 'ev1',
        sourceKind: 'ast',
        file: 'src/auth/login.ts',
        detail: 'imports shared',
        confidence: 'high',
      },
      {
        id: 'ev2',
        sourceKind: 'ast',
        file: 'src/billing/charge.ts',
        detail: 'imports auth',
        confidence: 'medium',
      },
    ],
    findings: [
      {
        id: 'f1',
        domain: 'architecture',
        type: 'cycle',
        detectorId: 'core/cycles',
        severity: 'high',
        title: 'cycle a/b',
        summary: 's',
        involvedNodeIds: ['subsystem:auth', 'subsystem:billing'],
      },
    ],
  })

describe('GetSubsystemTool metadata', () => {
  it('has name + description + schemas', () => {
    expect(GetSubsystemTool.name).toBe('get_subsystem')
    expect(GetSubsystemTool.description).toBeTruthy()
    expect(GetSubsystemTool.inputSchema).toBeDefined()
    expect(GetSubsystemTool.outputSchema).toBeDefined()
  })
})

describe('buildSubsystem', () => {
  it('returns expected node + dependsOn + consumedBy by exact id', () => {
    const loaded = buildLoadedSnapshot(makeSnap())
    const out = buildSubsystem(loaded, {
      id: 'subsystem:auth',
      includeFiles: true,
      includeEvidence: false,
    })
    expect(out.node.id).toBe('subsystem:auth')
    expect(out.dependsOn).toHaveLength(1)
    expect(out.dependsOn[0]?.nodeId).toBe('subsystem:shared')
    expect(out.dependsOn[0]?.title).toBe('Shared')
    expect(out.dependsOn[0]?.runtimeWeight).toBe(2)
    expect(out.consumedBy).toHaveLength(1)
    expect(out.consumedBy[0]?.nodeId).toBe('subsystem:billing')
  })

  it('returns files when includeFiles=true (default)', () => {
    const loaded = buildLoadedSnapshot(makeSnap())
    const out = buildSubsystem(loaded, {
      id: 'subsystem:auth',
      includeFiles: true,
      includeEvidence: false,
    })
    expect(out.files).toHaveLength(2)
    const loginFile = out.files?.find((f) => f.path === 'src/auth/login.ts')
    expect(loginFile?.importCount).toBe(1)
    const logoutFile = out.files?.find((f) => f.path === 'src/auth/logout.ts')
    expect(logoutFile?.importCount).toBe(0)
  })

  it('omits files when includeFiles=false', () => {
    const loaded = buildLoadedSnapshot(makeSnap())
    const out = buildSubsystem(loaded, {
      id: 'subsystem:auth',
      includeFiles: false,
      includeEvidence: false,
    })
    expect(out.files).toBeUndefined()
  })

  it('returns findings that involve the node', () => {
    const loaded = buildLoadedSnapshot(makeSnap())
    const out = buildSubsystem(loaded, {
      id: 'subsystem:auth',
      includeFiles: false,
      includeEvidence: false,
    })
    expect(out.findings).toHaveLength(1)
    expect(out.findings[0]?.type).toBe('cycle')
  })

  it('includes evidence when includeEvidence=true', () => {
    const loaded = buildLoadedSnapshot(makeSnap())
    const out = buildSubsystem(loaded, {
      id: 'subsystem:auth',
      includeFiles: false,
      includeEvidence: true,
    })
    expect(out.evidence).toBeDefined()
    expect(out.evidence?.length).toBeGreaterThanOrEqual(2)
    const ids = (out.evidence ?? []).map((e) => e.id).sort()
    expect(ids).toContain('ev1')
    expect(ids).toContain('ev2')
  })

  it('throws TARGET_NOT_FOUND ToolError for unknown id', () => {
    const loaded = buildLoadedSnapshot(makeSnap())
    expect(() =>
      buildSubsystem(loaded, {
        id: 'subsystem:nonexistent',
        includeFiles: true,
        includeEvidence: false,
      }),
    ).toThrow(ToolError)
    try {
      buildSubsystem(loaded, {
        id: 'subsystem:nonexistent',
        includeFiles: true,
        includeEvidence: false,
      })
    } catch (err) {
      expect(err).toBeInstanceOf(ToolError)
      expect((err as ToolError).code).toBe('TARGET_NOT_FOUND')
    }
  })

  it('supports kind:slug shorthand (auth resolves to subsystem:auth)', () => {
    const loaded = buildLoadedSnapshot(makeSnap())
    const out = buildSubsystem(loaded, { id: 'auth', includeFiles: false, includeEvidence: false })
    expect(out.node.id).toBe('subsystem:auth')
  })

  it('files omitted for non-subsystem target (e.g. file node)', () => {
    const loaded = buildLoadedSnapshot(makeSnap())
    const out = buildSubsystem(loaded, {
      id: 'file:src/auth/login.ts',
      includeFiles: true,
      includeEvidence: false,
    })
    expect(out.node.kind).toBe('file')
    expect(out.files).toBeUndefined()
  })
})
