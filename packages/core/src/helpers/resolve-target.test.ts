import { describe, expect, it } from 'vitest'
import type { Node } from '../schema/node.js'
import type { Snapshot } from '../schema/snapshot.js'
import { buildLoadedSnapshot } from '../snapshot/load-snapshot.js'
import { resolveTarget } from './resolve-target.js'

// ── Test helpers ───────────────────────────────────────────────────────────────

function makeNode(id: string, title?: string): Node {
  return {
    id,
    kind: 'subsystem',
    title: title ?? id,
    layer: 'unknown',
    status: 'unknown',
    tags: [],
    files: [],
    metadata: {},
  }
}

function makeFileNode(relPath: string): Node {
  return {
    id: `file:${relPath}`,
    kind: 'file',
    title: relPath,
    layer: 'unknown',
    status: 'unknown',
    tags: [],
    files: [relPath],
    metadata: {},
  }
}

function makeSnapshot(nodes: Node[]) {
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
    edges: [],
    evidence: [],
    findings: [],
  }
  return buildLoadedSnapshot(snap)
}

const emptySnap = makeSnapshot([])

// ── Tests ──────────────────────────────────────────────────────────────────────

describe('resolveTarget', () => {
  describe('Test 1: exact node id match', () => {
    it('resolveTarget(snap, "subsystem:auth") returns the auth node', () => {
      const authNode = makeNode('subsystem:auth', 'Authentication')
      const snap = makeSnapshot([authNode, makeNode('subsystem:billing', 'Billing')])
      const result = resolveTarget(snap, 'subsystem:auth')
      expect(result).toEqual(authNode)
    })
  })

  describe('Test 2: file path match with ./ prefix', () => {
    it('resolveTarget(snap, "./src/foo.ts") returns the file node', () => {
      const fileNode = makeFileNode('src/foo.ts')
      const snap = makeSnapshot([fileNode, makeNode('subsystem:auth', 'Auth')])
      const result = resolveTarget(snap, './src/foo.ts')
      expect(result).toEqual(fileNode)
    })

    it('resolveTarget(snap, "src/foo.ts") also works without ./ prefix', () => {
      const fileNode = makeFileNode('src/foo.ts')
      const snap = makeSnapshot([fileNode])
      const result = resolveTarget(snap, 'src/foo.ts')
      expect(result).toEqual(fileNode)
    })

    it('resolveTarget(snap, "src\\\\foo.ts") normalizes backslashes', () => {
      const fileNode = makeFileNode('src/foo.ts')
      const snap = makeSnapshot([fileNode])
      const result = resolveTarget(snap, 'src\\foo.ts')
      expect(result).toEqual(fileNode)
    })
  })

  describe('Test 3: kind:slug shorthand', () => {
    it('resolveTarget(snap, "auth") matches subsystem:auth', () => {
      const authNode = makeNode('subsystem:auth', 'Authentication')
      const snap = makeSnapshot([authNode])
      const result = resolveTarget(snap, 'auth')
      expect(result).toEqual(authNode)
    })

    it('resolveTarget(snap, "mylib") matches package:mylib', () => {
      const pkgNode = makeNode('package:mylib', 'My Library')
      pkgNode.kind = 'package'
      const snap = makeSnapshot([pkgNode])
      const result = resolveTarget(snap, 'mylib')
      expect(result).toEqual(pkgNode)
    })

    it('resolveTarget(snap, "react") matches external:react', () => {
      const extNode = makeNode('external:react', 'React')
      extNode.kind = 'external'
      const snap = makeSnapshot([extNode])
      const result = resolveTarget(snap, 'react')
      expect(result).toEqual(extNode)
    })
  })

  describe('Test 4: unique title match (case-insensitive)', () => {
    it('query "authentication" matches node with title "Authentication"', () => {
      const authNode = makeNode('subsystem:auth', 'Authentication')
      const snap = makeSnapshot([authNode, makeNode('subsystem:billing', 'Billing')])
      const result = resolveTarget(snap, 'authentication')
      expect(result).toEqual(authNode)
    })

    it('query "AUTHENTICATION" matches node with title "Authentication"', () => {
      const authNode = makeNode('subsystem:auth', 'Authentication')
      const snap = makeSnapshot([authNode])
      const result = resolveTarget(snap, 'AUTHENTICATION')
      expect(result).toEqual(authNode)
    })
  })

  describe('Test 5: ambiguous title', () => {
    it('two nodes with title "Service" → AMBIGUOUS with both candidate ids', () => {
      const node1 = makeNode('subsystem:service-a', 'Service')
      const node2 = makeNode('subsystem:service-b', 'Service')
      const snap = makeSnapshot([node1, node2])
      const result = resolveTarget(snap, 'service')
      expect(result).toEqual({
        error: 'AMBIGUOUS',
        candidates: expect.arrayContaining(['subsystem:service-a', 'subsystem:service-b']),
      })
      expect('error' in result && result.candidates).toHaveLength(2)
    })

    it('three nodes with title "Service" → AMBIGUOUS with three candidate ids', () => {
      const node1 = makeNode('subsystem:svc-1', 'Service')
      const node2 = makeNode('subsystem:svc-2', 'Service')
      const node3 = makeNode('subsystem:svc-3', 'Service')
      const snap = makeSnapshot([node1, node2, node3])
      const result = resolveTarget(snap, 'service')
      expect('error' in result && result.error).toBe('AMBIGUOUS')
      expect('error' in result && result.candidates).toHaveLength(3)
    })
  })

  describe('Test 6: not found → fuzzy suggestions', () => {
    it('query "authh" (typo of auth) → NOT_FOUND with closest match first', () => {
      const authNode = makeNode('subsystem:auth', 'Authentication')
      const billingNode = makeNode('subsystem:billing', 'Billing')
      const snap = makeSnapshot([authNode, billingNode])
      const result = resolveTarget(snap, 'authh')
      expect('error' in result && result.error).toBe('NOT_FOUND')
      expect('error' in result && result.candidates).toBeDefined()
      // 'subsystem:auth' should be the closest match to 'authh'
      const candidates = 'error' in result ? result.candidates : []
      expect(candidates[0]).toBe('subsystem:auth')
    })

    it('returns at most 3 fuzzy suggestions', () => {
      const nodes = [
        makeNode('subsystem:alpha'),
        makeNode('subsystem:beta'),
        makeNode('subsystem:gamma'),
        makeNode('subsystem:delta'),
        makeNode('subsystem:epsilon'),
      ]
      const snap = makeSnapshot(nodes)
      const result = resolveTarget(snap, 'xyz-not-found')
      expect('error' in result && result.error).toBe('NOT_FOUND')
      expect('error' in result && result.candidates.length).toBeLessThanOrEqual(3)
    })
  })

  describe('Test 7: precedence — exact id wins over title match', () => {
    it('exact id "subsystem:foo" beats a node whose title is "subsystem:foo"', () => {
      // node1: id=subsystem:foo, title=bar
      const node1 = makeNode('subsystem:foo', 'bar')
      // node2: id=subsystem:other, title=subsystem:foo  (title matches the query exactly)
      const node2 = makeNode('subsystem:other', 'subsystem:foo')
      const snap = makeSnapshot([node1, node2])
      // Query 'subsystem:foo' — step 1 (exact id) should win over step 4 (title match)
      const result = resolveTarget(snap, 'subsystem:foo')
      expect(result).toEqual(node1)
    })
  })

  describe('Test 8: empty snapshot → NOT_FOUND with empty candidates', () => {
    it('resolveTarget(emptySnap, "anything") → NOT_FOUND with empty candidates', () => {
      const result = resolveTarget(emptySnap, 'anything')
      expect(result).toEqual({ error: 'NOT_FOUND', candidates: [] })
    })
  })
})
