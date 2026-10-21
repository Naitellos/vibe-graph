import { describe, expect, it } from 'vitest'
import type { Edge } from '../schema/edge.js'
import type { Node } from '../schema/node.js'
import type { Snapshot } from '../schema/snapshot.js'
import { buildLoadedSnapshot } from '../snapshot/load-snapshot.js'
import { inferRole, pickCriticalFiles } from './pick-critical-files.js'

// ── Test helpers ───────────────────────────────────────────────────────────────

function makeNode(id: string): Node {
  const kind = id.startsWith('file:') ? 'file' : id.startsWith('subsystem:') ? 'subsystem' : 'file'
  return {
    id,
    kind,
    title: id,
    layer: 'unknown',
    status: 'unknown',
    tags: [],
    files: [],
    metadata: {},
  }
}

function makeEdge(from: string, to: string, kind: Edge['kind'] = 'imports'): Edge {
  return {
    id: `edge:${from}:${to}:${kind}`,
    from,
    to,
    kind,
    category: 'structural',
    source: 'manual',
    confidence: 'high',
    evidenceIds: [],
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

function makeSnapshot(nodes: Node[], edges: Edge[]) {
  const snap: Snapshot = {
    meta: {
      schemaVersion: '0.1.0',
      scanId: '11111111-1111-4111-8111-111111111111',
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
    findings: [],
  }
  return buildLoadedSnapshot(snap)
}

// ── Auth subsystem snapshot ────────────────────────────────────────────────────

const authNodes = [
  makeNode('subsystem:auth'),
  makeNode('file:src/auth/index.ts'),
  makeNode('file:src/auth/login.ts'),
  makeNode('file:src/auth/login.test.ts'),
  makeNode('file:src/auth/auth.config.ts'),
]
const authEdges = [
  makeContainsEdge('subsystem:auth', 'file:src/auth/index.ts'),
  makeContainsEdge('subsystem:auth', 'file:src/auth/login.ts'),
  makeContainsEdge('subsystem:auth', 'file:src/auth/login.test.ts'),
  makeContainsEdge('subsystem:auth', 'file:src/auth/auth.config.ts'),
]

// ── Tests ──────────────────────────────────────────────────────────────────────

describe('pickCriticalFiles', () => {
  describe('Test 1: subsystem with mixed files — expected ordering', () => {
    it('returns 4 files ordered entry > core > test > config', () => {
      const snap = makeSnapshot(authNodes, authEdges)
      const result = pickCriticalFiles(snap, 'subsystem:auth')
      expect(result).toHaveLength(4)
      expect(result[0]).toMatchObject({
        fileNodeId: 'file:src/auth/index.ts',
        path: 'src/auth/index.ts',
        role: 'entry',
      })
      expect(result[1]).toMatchObject({
        fileNodeId: 'file:src/auth/login.ts',
        path: 'src/auth/login.ts',
        role: 'core',
      })
      expect(result[2]).toMatchObject({
        fileNodeId: 'file:src/auth/login.test.ts',
        path: 'src/auth/login.test.ts',
        role: 'test',
      })
      expect(result[3]).toMatchObject({
        fileNodeId: 'file:src/auth/auth.config.ts',
        path: 'src/auth/auth.config.ts',
        role: 'config',
      })
    })
  })

  describe('Test 2: maxFiles cap', () => {
    it('returns only first 2 files when maxFiles=2', () => {
      const snap = makeSnapshot(authNodes, authEdges)
      const result = pickCriticalFiles(snap, 'subsystem:auth', { maxFiles: 2 })
      expect(result).toHaveLength(2)
      expect(result[0]?.fileNodeId).toBe('file:src/auth/index.ts')
      expect(result[1]?.fileNodeId).toBe('file:src/auth/login.ts')
    })
  })

  describe('Test 3: file-node target', () => {
    it('returns single entry for a file node target', () => {
      const snap = makeSnapshot(authNodes, authEdges)
      const result = pickCriticalFiles(snap, 'file:src/auth/login.test.ts')
      expect(result).toHaveLength(1)
      expect(result[0]).toMatchObject({
        fileNodeId: 'file:src/auth/login.test.ts',
        path: 'src/auth/login.test.ts',
        role: 'test',
      })
    })
  })

  describe('Test 4: empty subsystem (no contains edges)', () => {
    it('returns empty array for subsystem with no contains edges', () => {
      const emptySubsystem = makeNode('subsystem:empty')
      const snap = makeSnapshot([emptySubsystem], [])
      const result = pickCriticalFiles(snap, 'subsystem:empty')
      expect(result).toHaveLength(0)
    })
  })

  describe('Test 6: alphabetical tie-break within role', () => {
    it('orders core files alphabetically when roles are equal', () => {
      const nodes = [
        makeNode('subsystem:pkg'),
        makeNode('file:src/b.ts'),
        makeNode('file:src/a.ts'),
        makeNode('file:src/c.ts'),
      ]
      const edges = [
        makeContainsEdge('subsystem:pkg', 'file:src/b.ts'),
        makeContainsEdge('subsystem:pkg', 'file:src/a.ts'),
        makeContainsEdge('subsystem:pkg', 'file:src/c.ts'),
      ]
      const snap = makeSnapshot(nodes, edges)
      const result = pickCriticalFiles(snap, 'subsystem:pkg')
      expect(result).toHaveLength(3)
      expect(result[0]?.path).toBe('src/a.ts')
      expect(result[1]?.path).toBe('src/b.ts')
      expect(result[2]?.path).toBe('src/c.ts')
      expect(result.every((f) => f.role === 'core')).toBe(true)
    })
  })
})

describe('inferRole', () => {
  describe('Test 5: role inference cases', () => {
    it.each([
      // entry
      ['index.ts', 'entry'],
      ['main.ts', 'entry'],
      ['app.tsx', 'entry'],
      ['bin.js', 'entry'],
      ['server.ts', 'entry'],
      // test
      ['foo.test.ts', 'test'],
      ['foo.spec.tsx', 'test'],
      ['foo_test.js', 'test'],
      // config
      ['bar.config.ts', 'config'],
      ['tsconfig.json', 'config'],
      ['biome.json', 'config'],
      ['vitest.config.ts', 'config'],
      // core
      ['random.ts', 'core'],
      ['utils.ts', 'core'],
      ['auth-service.ts', 'core'],
    ])('inferRole("%s") → %s', (path, expected) => {
      expect(inferRole(path)).toBe(expected)
    })
  })
})
