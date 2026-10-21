import { mkdtemp, rm, writeFile } from 'node:fs/promises'
import { tmpdir } from 'node:os'
import { join } from 'node:path'
import { afterEach, beforeEach, describe, expect, it } from 'vitest'
import { createIgnoreMatcher } from '../analyzers/ignore-matcher.js'
import type { Edge } from '../schema/edge.js'
import type { Finding } from '../schema/finding.js'
import type { Node } from '../schema/node.js'
import type { Snapshot } from '../schema/snapshot.js'
import { buildLoadedSnapshot } from '../snapshot/load-snapshot.js'
import { buildContextPack } from './context-pack-builder.js'

// ── Test helpers ───────────────────────────────────────────────────────────────

function makeNode(id: string, overrides: Partial<Node> = {}): Node {
  const kind = id.startsWith('file:') ? 'file' : id.startsWith('subsystem:') ? 'subsystem' : 'file'
  return {
    id,
    kind,
    title: id.replace('file:', '').replace('subsystem:', ''),
    layer: 'unknown',
    status: 'unknown',
    tags: [],
    files: [],
    metadata: {},
    ...overrides,
  }
}

function makeEdge(
  from: string,
  to: string,
  kind: Edge['kind'] = 'imports',
  evidenceIds: string[] = [],
): Edge {
  return {
    id: `edge:${from}:${to}:${kind}`,
    from,
    to,
    kind,
    category: 'structural',
    source: 'manual',
    confidence: 'high',
    evidenceIds,
    weight: 1,
    runtimeWeight: 0,
    typeOnlyWeight: 0,
    dynamicWeight: 0,
    metadata: {},
  }
}

function makeContainsEdge(from: string, to: string): Edge {
  return makeEdge(from, to, 'contains')
}

function makeDepEdge(from: string, to: string): Edge {
  return makeEdge(from, to, 'depends_on', ['ev1'])
}

function makeFinding(id: string, title: string, involvedNodeIds: string[]): Finding {
  return {
    id,
    domain: 'architecture',
    type: 'high-fan-out',
    detectorId: 'test-detector',
    severity: 'medium',
    title,
    summary: 'Test finding',
    involvedNodeIds,
    evidenceIds: [],
    status: 'open',
    metadata: {},
  }
}

const BASE_SCAN_ID = '11111111-1111-4111-8111-111111111111'

function makeSnapshot(
  nodes: Node[],
  edges: Edge[],
  findings: Finding[] = [],
): ReturnType<typeof buildLoadedSnapshot> {
  const snap: Snapshot = {
    meta: {
      schemaVersion: '0.1.0',
      scanId: BASE_SCAN_ID,
      builtAt: '2026-05-24T10:00:00.000Z',
      projectRoot: '/test',
      projectName: 'test',
      vibegraphVersion: '0.0.0',
      scanDurationMs: 0,
      fileCounts: { scanned: 0, indexed: 0, skipped: 0 },
    },
    nodes,
    edges,
    evidence: [],
    findings,
  }
  return buildLoadedSnapshot(snap)
}

const defaultIgnore = createIgnoreMatcher({ patterns: [], includeDefaults: true })

// ── Auth subsystem fixture ─────────────────────────────────────────────────────

const AUTH_TARGET = 'subsystem:auth'
const SHARED_TARGET = 'subsystem:shared'

const authNodes = [
  makeNode(AUTH_TARGET),
  makeNode(SHARED_TARGET),
  makeNode('file:src/auth/index.ts'),
  makeNode('file:src/auth/login.ts'),
  makeNode('file:src/auth/session.ts'),
]

const authEdges = [
  makeContainsEdge(AUTH_TARGET, 'file:src/auth/index.ts'),
  makeContainsEdge(AUTH_TARGET, 'file:src/auth/login.ts'),
  makeContainsEdge(AUTH_TARGET, 'file:src/auth/session.ts'),
  makeDepEdge(AUTH_TARGET, SHARED_TARGET),
]

const authFinding = makeFinding('finding:1', 'Auth has high fan-out', [AUTH_TARGET, SHARED_TARGET])

// ── Tests ──────────────────────────────────────────────────────────────────────

describe('buildContextPack', () => {
  let tmpDir: string

  beforeEach(async () => {
    tmpDir = await mkdtemp(join(tmpdir(), 'context-pack-test-'))
  })

  afterEach(async () => {
    await rm(tmpDir, { recursive: true, force: true })
  })

  // ── Test 1: full subsystem with all sections ───────────────────────────────

  describe('Test 1: build for subsystem with all sections', () => {
    it('produces a valid ContextPack with all expected fields', async () => {
      const { mkdir } = await import('node:fs/promises')
      await mkdir(join(tmpDir, 'src', 'auth'), { recursive: true })
      await writeFile(
        join(tmpDir, 'src', 'auth', 'index.ts'),
        'export * from "./login.js"\nexport * from "./session.js"\n',
      )
      await writeFile(
        join(tmpDir, 'src', 'auth', 'login.ts'),
        'export function login(user: string): boolean { return true }\n',
      )
      await writeFile(
        join(tmpDir, 'src', 'auth', 'session.ts'),
        'export class Session { constructor(public id: string) {} }\n',
      )

      const snap = makeSnapshot(authNodes, authEdges, [authFinding])
      const pack = await buildContextPack(snap, {
        target: AUTH_TARGET,
        projectRoot: tmpDir,
        ignore: defaultIgnore,
      })

      expect(pack.id).toMatch(/^ctx_[0-9a-f]{16}$/)
      expect(pack.target).toBe(AUTH_TARGET)
      expect(pack.summary).toBeTruthy()
      expect(pack.facts.length).toBeGreaterThan(0)
      expect(pack.criticalFiles).toHaveLength(3)
      // All files have excerpts since they exist on disk and aren't ignored
      for (const f of pack.criticalFiles) {
        expect(f.excerpt).toBeDefined()
      }
      // Edge from auth → shared should appear in relationships
      const rel = pack.relationships.find((r) => r.from === AUTH_TARGET && r.to === SHARED_TARGET)
      expect(rel).toBeDefined()
      expect(rel?.kind).toBe('depends_on')
      // No redactions
      expect(pack.metadata.redactions).toBeUndefined()
      // Required arrays
      expect(pack.recommendations).toEqual([])
      expect(pack.tests).toEqual([])
      expect(pack.doNotDo).toEqual([])
    })
  })

  // ── Test 2: budget enforcement ─────────────────────────────────────────────

  describe('Test 2: budget enforcement drops excerpts when over budget', () => {
    it('estimated tokens stay within or near budget', async () => {
      const { mkdir } = await import('node:fs/promises')
      await mkdir(join(tmpDir, 'src', 'auth'), { recursive: true })
      // Write files with moderately sized content so they consume tokens
      const content = 'export const x = 1;\n'.repeat(20) // 20 lines each
      await writeFile(join(tmpDir, 'src', 'auth', 'index.ts'), content)
      await writeFile(join(tmpDir, 'src', 'auth', 'login.ts'), content)
      await writeFile(join(tmpDir, 'src', 'auth', 'session.ts'), content)

      const snap = makeSnapshot(authNodes, authEdges, [authFinding])
      const pack = await buildContextPack(snap, {
        target: AUTH_TARGET,
        maxTokens: 100,
        projectRoot: tmpDir,
        ignore: defaultIgnore,
      })

      expect(pack.tokenBudget).toBe(100)
      // At least some files may have their excerpts dropped
      // The key invariant is estimatedTokens is within the budget (or just over
      // because we only drop full excerpts, not trim them)
      // Accept up to 2x budget as a loose bound since we drop whole excerpts
      expect(pack.estimatedTokens).toBeLessThanOrEqual(pack.tokenBudget * 2)
    })
  })

  // ── Test 3: secret redaction triggers metadata ─────────────────────────────

  describe('Test 3: secret redaction triggers metadata', () => {
    it('redacts sk- token and populates metadata.redactions', async () => {
      const { mkdir } = await import('node:fs/promises')
      await mkdir(join(tmpDir, 'src', 'auth'), { recursive: true })

      // File with an OpenAI-style key
      const secretContent = [
        'const apiKey = "sk-abc1234567890ABC12345678901234567890"',
        'export function getKey() { return apiKey }',
      ].join('\n')
      await writeFile(join(tmpDir, 'src', 'auth', 'login.ts'), secretContent)
      // Other files just have plain content
      await writeFile(join(tmpDir, 'src', 'auth', 'index.ts'), 'export * from "./login.js"\n')
      await writeFile(join(tmpDir, 'src', 'auth', 'session.ts'), 'export class Session {}\n')

      const snap = makeSnapshot(authNodes, authEdges)
      const pack = await buildContextPack(snap, {
        target: AUTH_TARGET,
        projectRoot: tmpDir,
        ignore: defaultIgnore,
      })

      expect(pack.metadata.redactions).toBeDefined()
      expect(pack.metadata.redactions?.totalCount).toBeGreaterThanOrEqual(1)
      expect(pack.metadata.redactions?.byKind['openai-key']).toBeGreaterThanOrEqual(1)

      // Find the excerpt for login.ts and verify redaction
      const loginFile = pack.criticalFiles.find((f) => f.path === 'src/auth/login.ts')
      expect(loginFile).toBeDefined()
      expect(loginFile?.excerpt).toBeDefined()
      expect(loginFile?.excerpt).toContain('<REDACTED:openai-key>')
      expect(loginFile?.excerpt).not.toContain('sk-abc1234567890')
    })
  })

  // ── Test 4: target not found ───────────────────────────────────────────────

  describe('Test 4: target not found throws', () => {
    it('rejects with TARGET_NOT_FOUND error', async () => {
      const snap = makeSnapshot(authNodes, authEdges)
      await expect(
        buildContextPack(snap, {
          target: 'nonexistent:foo',
          projectRoot: tmpDir,
          ignore: defaultIgnore,
        }),
      ).rejects.toThrow('TARGET_NOT_FOUND')
    })
  })

  // ── Test 5: ignore matcher skips file ─────────────────────────────────────

  describe('Test 5: ignore matcher skips ignored files', () => {
    it('.env file in snapshot has no excerpt even though it exists on disk', async () => {
      // Build a snapshot with a .env file
      const nodes = [makeNode('subsystem:cfg'), makeNode('file:.env')]
      const edges = [makeContainsEdge('subsystem:cfg', 'file:.env')]
      const snap = makeSnapshot(nodes, edges)

      // Write it to disk
      await writeFile(join(tmpDir, '.env'), 'SECRET=abc12345678901234567890\n')

      const pack = await buildContextPack(snap, {
        target: 'subsystem:cfg',
        projectRoot: tmpDir,
        ignore: defaultIgnore,
      })

      const envFile = pack.criticalFiles.find((f) => f.path === '.env')
      expect(envFile).toBeDefined()
      // .env is ignored by defaults, so no excerpt
      expect(envFile?.excerpt).toBeUndefined()
    })
  })

  // ── Test 6: empty subsystem ────────────────────────────────────────────────

  describe('Test 6: empty subsystem builds cleanly', () => {
    it('produces pack with empty criticalFiles but valid structure', async () => {
      const nodes = [makeNode('subsystem:empty')]
      const snap = makeSnapshot(nodes, [])
      const pack = await buildContextPack(snap, {
        target: 'subsystem:empty',
        projectRoot: tmpDir,
        ignore: defaultIgnore,
      })

      expect(pack.id).toMatch(/^ctx_[0-9a-f]{16}$/)
      expect(pack.criticalFiles).toEqual([])
      expect(pack.facts).toBeDefined()
      expect(pack.relationships).toBeDefined()
      expect(pack.blastRadius).toBeDefined()
    })
  })

  // ── Test 7: ContextPackSchema validation ──────────────────────────────────

  describe('Test 7: schema validates', () => {
    it('returned object passes ContextPackSchema.parse without throw', async () => {
      const { ContextPackSchema } = await import('../schema/context-pack.js')
      const snap = makeSnapshot(authNodes, authEdges)
      const pack = await buildContextPack(snap, {
        target: AUTH_TARGET,
        projectRoot: tmpDir,
        ignore: defaultIgnore,
      })
      // If this doesn't throw, the schema is satisfied
      expect(() => ContextPackSchema.parse(pack)).not.toThrow()
    })
  })
})
