import { isDependencyEdge } from '../graph/edge-categories.js'
import { loadBaseline } from '../helpers/baseline-store.js'
import type { FindingDomain } from '../schema/common.js'
import type { Finding } from '../schema/finding.js'
import type { LoadedSnapshot } from '../snapshot/load-snapshot.js'
import type { Detector, DetectorContext } from './types.js'

const isSubsystemNode = (id: string) => id.startsWith('subsystem:')

/**
 * Returns the set of file node IDs in the snapshot that are not claimed by
 * any subsystem via a `contains` edge. Pure helper — no side-effects.
 */
export function findUnownedFileIds(snapshot: LoadedSnapshot): Set<string> {
  const ownedFileIds = new Set<string>()
  for (const e of snapshot.raw.edges) {
    if (e.kind === 'contains' && isSubsystemNode(e.from)) {
      ownedFileIds.add(e.to)
    }
  }
  const unowned = new Set<string>()
  for (const node of snapshot.raw.nodes) {
    if (node.kind !== 'file') continue
    if (ownedFileIds.has(node.id)) continue
    unowned.add(node.id)
  }
  return unowned
}

const titleOf = (ctx: DetectorContext, id: string): string =>
  ctx.snapshot.nodesById.get(id)?.title ?? id.replace(/^subsystem:/, '')

export const coreDriftDetector: Detector = {
  id: 'core/drift',
  description: 'detects stale yaml / undeclared ast / unowned file drift',
  domain: 'drift' as FindingDomain,

  async run(ctx: DetectorContext): Promise<Finding[]> {
    const { snapshot } = ctx
    const baseline = await loadBaseline(snapshot.raw.meta.projectRoot)
    const findings: Finding[] = []

    // ── Edge drift: stale / undeclared ─────────────────────────────────────────

    // Collect all subsystem→subsystem dependency edges grouped by source
    const pairsByYaml = new Map<string, string[]>()
    const pairsByAst = new Map<string, string[]>()

    for (const e of snapshot.raw.edges) {
      if (!isDependencyEdge(e)) continue
      if (!isSubsystemNode(e.from) || !isSubsystemNode(e.to)) continue

      const key = `${e.from}|${e.to}`
      if (e.source === 'yaml') {
        const arr = pairsByYaml.get(key) ?? []
        arr.push(...e.evidenceIds)
        pairsByYaml.set(key, arr)
      } else if (e.source === 'ast' || e.source === 'derived') {
        const arr = pairsByAst.get(key) ?? []
        arr.push(...e.evidenceIds)
        pairsByAst.set(key, arr)
      }
    }

    const allPairs = new Set<string>([...pairsByYaml.keys(), ...pairsByAst.keys()])

    for (const key of allPairs) {
      const [from, to] = key.split('|')
      if (from === undefined || to === undefined) continue
      const hasYaml = pairsByYaml.has(key)
      const hasAst = pairsByAst.has(key)

      if (hasYaml && !hasAst) {
        const id = `drift:stale:${from}:${to}`
        findings.push({
          id,
          domain: 'drift' as const,
          type: 'stale',
          detectorId: 'core/drift',
          severity: 'medium' as const,
          title: `Stale dependency: ${titleOf(ctx, from)} declares depends_on ${titleOf(ctx, to)} but no AST evidence found`,
          summary: `The YAML architecture declares ${titleOf(ctx, from)} → ${titleOf(ctx, to)} but no code-level import evidence was found. The dependency may be outdated.`,
          involvedNodeIds: [from, to],
          evidenceIds: pairsByYaml.get(key) ?? [],
          status: baseline.get(id)?.status ?? 'open',
          metadata: {},
        })
      } else if (!hasYaml && hasAst) {
        const id = `drift:undeclared:${from}:${to}`
        findings.push({
          id,
          domain: 'drift' as const,
          type: 'undeclared',
          detectorId: 'core/drift',
          severity: 'low' as const,
          title: `Undeclared dependency: ${titleOf(ctx, from)} imports ${titleOf(ctx, to)} but not in depends_on`,
          summary: `Code-level imports from ${titleOf(ctx, from)} to ${titleOf(ctx, to)} exist but the dependency is not declared in the YAML architecture.`,
          involvedNodeIds: [from, to],
          evidenceIds: pairsByAst.get(key) ?? [],
          status: baseline.get(id)?.status ?? 'open',
          metadata: {},
        })
      }
    }

    // ── Unowned files ──────────────────────────────────────────────────────────

    for (const fileId of findUnownedFileIds(snapshot)) {
      const node = snapshot.nodesById.get(fileId)
      if (!node) continue

      const id = `drift:unowned:${node.id}`
      findings.push({
        id,
        domain: 'drift' as const,
        type: 'unowned',
        detectorId: 'core/drift',
        severity: 'low' as const,
        title: `Unowned file: ${node.title} not matched by any subsystem.match glob`,
        summary: `The file ${node.title} exists in the graph but no subsystem claims ownership via a match glob. Add it to a subsystem or exclude it explicitly.`,
        involvedNodeIds: [node.id],
        evidenceIds: [],
        status: baseline.get(id)?.status ?? 'open',
        metadata: {},
      })
    }

    return findings
  },
}
