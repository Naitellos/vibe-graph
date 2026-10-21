import { mkdir, mkdtemp, rm } from 'node:fs/promises'
import { tmpdir } from 'node:os'
import { join } from 'node:path'
import { pino } from 'pino'
import { afterEach, beforeEach, describe, expect, it } from 'vitest'
import { writeBaselineEntry } from '../helpers/baseline-store.js'
import type { Edge } from '../schema/edge.js'
import type { Node } from '../schema/node.js'
import type { Snapshot } from '../schema/snapshot.js'
import { buildLoadedSnapshot } from '../snapshot/load-snapshot.js'
import { coreDriftDetector } from './core-drift.js'

// ── Test helpers ──────────────────────────────────────────────────────────────

const silentLog = pino({ level: 'silent' })

function makeSubsystemNode(id: string): Node {
  return {
    id: `subsystem:${id}`,
    kind: 'subsystem',
    title: id,
    layer: 'domain',
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
    layer: 'domain',
    status: 'unknown',
    tags: [],
    files: [],
    metadata: {},
  }
}

function makeEdge(
  from: string,
  to: string,
  opts: { source: Edge['source']; kind?: Edge['kind'] },
): Edge {
  return {
    id: `${from}->${to}:${opts.kind ?? 'depends_on'}:${opts.source}`,
    from,
    to,
    kind: opts.kind ?? 'depends_on',
    category: 'domain',
    source: opts.source,
    confidence: 'high',
    evidenceIds: [],
    weight: 1,
    runtimeWeight: 0,
    typeOnlyWeight: 0,
    dynamicWeight: 0,
    metadata: {},
  }
}

function makeSnapshot(nodes: Node[], edges: Edge[], projectRoot: string) {
  const snap: Snapshot = {
    meta: {
      schemaVersion: '0.1.0',
      scanId: '00000000-0000-0000-0000-000000000001',
      builtAt: new Date().toISOString(),
      projectRoot,
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

// ── Tests ─────────────────────────────────────────────────────────────────────

describe('coreDriftDetector', () => {
  let tmpRoot: string

  beforeEach(async () => {
    tmpRoot = await mkdtemp(join(tmpdir(), 'vg-drift-'))
  })

  afterEach(async () => {
    await rm(tmpRoot, { recursive: true, force: true })
  })

  // Case 1: yaml+ast present for same pair → no drift
  it('Case 1: yaml+ast both present for same A→B pair → 0 drift findings', async () => {
    const nodes = [makeSubsystemNode('a'), makeSubsystemNode('b')]
    const edges = [
      makeEdge('subsystem:a', 'subsystem:b', { source: 'yaml' }),
      makeEdge('subsystem:a', 'subsystem:b', { source: 'ast' }),
    ]
    const loaded = makeSnapshot(nodes, edges, tmpRoot)
    const findings = await coreDriftDetector.run({ snapshot: loaded, log: silentLog })
    expect(findings.filter((f) => f.domain === 'drift')).toHaveLength(0)
  })

  // Case 2: yaml-only edge → 1 stale finding with severity medium
  it('Case 2: yaml-only A→B → stale finding with severity medium', async () => {
    const nodes = [makeSubsystemNode('a'), makeSubsystemNode('b')]
    const edges = [makeEdge('subsystem:a', 'subsystem:b', { source: 'yaml' })]
    const loaded = makeSnapshot(nodes, edges, tmpRoot)
    const findings = await coreDriftDetector.run({ snapshot: loaded, log: silentLog })
    expect(findings).toHaveLength(1)
    expect(findings[0]?.id).toBe('drift:stale:subsystem:a:subsystem:b')
    expect(findings[0]?.severity).toBe('medium')
    expect(findings[0]?.domain).toBe('drift')
    expect(findings[0]?.status).toBe('open')
  })

  // Case 3: ast-only edge → 1 undeclared finding with severity low
  it('Case 3: ast-only A→B → undeclared finding with severity low', async () => {
    const nodes = [makeSubsystemNode('a'), makeSubsystemNode('b')]
    const edges = [makeEdge('subsystem:a', 'subsystem:b', { source: 'ast' })]
    const loaded = makeSnapshot(nodes, edges, tmpRoot)
    const findings = await coreDriftDetector.run({ snapshot: loaded, log: silentLog })
    expect(findings).toHaveLength(1)
    expect(findings[0]?.id).toBe('drift:undeclared:subsystem:a:subsystem:b')
    expect(findings[0]?.severity).toBe('low')
    expect(findings[0]?.domain).toBe('drift')
    expect(findings[0]?.status).toBe('open')
  })

  // Case 4: file node with no contains edge → unowned finding with severity low
  it('Case 4: file outside all subsystem tracks → unowned finding with severity low', async () => {
    const nodes = [makeSubsystemNode('a'), makeFileNode('src/orphan.ts')]
    // No 'contains' edge from subsystem:a to the file
    const edges: Edge[] = []
    const loaded = makeSnapshot(nodes, edges, tmpRoot)
    const findings = await coreDriftDetector.run({ snapshot: loaded, log: silentLog })
    const unowned = findings.filter((f) => f.id.startsWith('drift:unowned:'))
    expect(unowned).toHaveLength(1)
    expect(unowned[0]?.id).toBe('drift:unowned:file:src/orphan.ts')
    expect(unowned[0]?.severity).toBe('low')
    expect(unowned[0]?.domain).toBe('drift')
  })

  // Case 5: lonely subsystem with no dep edges either way → 0 drift
  it('Case 5: lonely subsystem with no dep edges → 0 drift findings', async () => {
    const nodes = [makeSubsystemNode('solo')]
    const edges: Edge[] = []
    const loaded = makeSnapshot(nodes, edges, tmpRoot)
    const findings = await coreDriftDetector.run({ snapshot: loaded, log: silentLog })
    const driftFindings = findings.filter(
      (f) =>
        (f.domain === 'drift' && f.id.startsWith('drift:stale:')) ||
        f.id.startsWith('drift:undeclared:'),
    )
    expect(driftFindings).toHaveLength(0)
  })

  // Case 6: yaml depends_on references missing subsystem (no AST evidence) → stale finding
  it('Case 6: yaml depends_on references missing subsystem → stale finding', async () => {
    // subsystem:a exists, subsystem:y does NOT exist as a node, but a yaml edge references it
    const nodes = [makeSubsystemNode('a')]
    const edges = [makeEdge('subsystem:a', 'subsystem:y', { source: 'yaml' })]
    const loaded = makeSnapshot(nodes, edges, tmpRoot)
    const findings = await coreDriftDetector.run({ snapshot: loaded, log: silentLog })
    const stale = findings.filter((f) => f.id === 'drift:stale:subsystem:a:subsystem:y')
    expect(stale).toHaveLength(1)
    expect(stale[0]?.severity).toBe('medium')
  })

  // Case 7: baseline accepted → finding still emitted but status:'accepted'
  it('Case 7: baseline accepted id → finding emitted with status:accepted', async () => {
    // Write the baseline entry before running
    await mkdir(join(tmpRoot, '.vibegraph'), { recursive: true })
    await writeBaselineEntry(tmpRoot, {
      findingId: 'drift:stale:subsystem:a:subsystem:b',
      status: 'accepted',
    })

    const nodes = [makeSubsystemNode('a'), makeSubsystemNode('b')]
    const edges = [makeEdge('subsystem:a', 'subsystem:b', { source: 'yaml' })]
    const loaded = makeSnapshot(nodes, edges, tmpRoot)
    const findings = await coreDriftDetector.run({ snapshot: loaded, log: silentLog })
    expect(findings).toHaveLength(1)
    expect(findings[0]?.id).toBe('drift:stale:subsystem:a:subsystem:b')
    expect(findings[0]?.status).toBe('accepted')
  })

  // Case 8: consumed_by inverse + depends_on confirm → 0 drift
  // A.consumed_by:[B] → yaml edge B→A; B AST imports from A → ast edge B→A; agree → no drift
  it('Case 8: consumed_by inverse yaml + ast import confirm same direction → 0 drift', async () => {
    const nodes = [makeSubsystemNode('a'), makeSubsystemNode('b')]
    // B→A yaml (from consumed_by) and B→A ast (from imports) both exist
    const edges = [
      makeEdge('subsystem:b', 'subsystem:a', { source: 'yaml' }),
      makeEdge('subsystem:b', 'subsystem:a', { source: 'ast' }),
    ]
    const loaded = makeSnapshot(nodes, edges, tmpRoot)
    const findings = await coreDriftDetector.run({ snapshot: loaded, log: silentLog })
    expect(findings.filter((f) => f.domain === 'drift')).toHaveLength(0)
  })
})
