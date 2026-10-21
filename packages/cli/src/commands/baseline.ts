import { createHash } from 'node:crypto'
import { existsSync } from 'node:fs'
import { readFile } from 'node:fs/promises'
import { join } from 'node:path'
import {
  type GraphBaseline,
  type Snapshot,
  SnapshotSchema,
  resolveProjectRoot,
  writeGraphBaseline,
} from '@codearch/core'
import { defineCommand } from 'citty'
import { createCliLogger } from '../logger.js'
import { runOneShotScan } from './scan.js'

export interface RunBaselineOptions {
  projectRoot: string
}

export type RunBaselineResult =
  | { status: 'ok'; baselinePath: string; snapshotId: string; fingerprint: string }
  | { status: 'error'; error: string }

/**
 * Pure runner — exported for tests. The CLI command wraps this.
 *
 * Reads `.vibegraph/cache/graph.json`, computes a content fingerprint over
 * nodes+edges+findings, and atomically writes `.vibegraph/cache/baseline.json`.
 */
export async function runBaseline(opts: RunBaselineOptions): Promise<RunBaselineResult> {
  const graphPath = join(opts.projectRoot, '.vibegraph', 'cache', 'graph.json')
  if (!existsSync(graphPath)) {
    return {
      status: 'error',
      error: `No graph.json found at ${graphPath}. Run \`vibe-graph scan\` first.`,
    }
  }

  let snapshot: Snapshot
  try {
    snapshot = SnapshotSchema.parse(JSON.parse(await readFile(graphPath, 'utf-8')))
  } catch (err) {
    return {
      status: 'error',
      error: `Failed to parse graph.json as a Vibe Graph snapshot: ${(err as Error).message}. Run \`vibe-graph scan\` first.`,
    }
  }

  // scanId lives at snapshot.meta.scanId (SnapshotMetaSchema), not root level
  const snapshotId = snapshot.meta.scanId

  const fingerprint = computeFingerprint(snapshot)
  const baseline: GraphBaseline = {
    schemaVersion: '1.0',
    snapshotId,
    createdAt: new Date().toISOString(),
    fingerprint,
    nodes: snapshot.nodes as GraphBaseline['nodes'],
    edges: snapshot.edges as GraphBaseline['edges'],
    findings: snapshot.findings as GraphBaseline['findings'],
  }
  await writeGraphBaseline(opts.projectRoot, baseline)

  return {
    status: 'ok',
    baselinePath: join(opts.projectRoot, '.vibegraph', 'cache', 'baseline.json'),
    snapshotId,
    fingerprint,
  }
}

function computeFingerprint(snapshot: Pick<Snapshot, 'nodes' | 'edges' | 'findings'>): string {
  const hash = createHash('sha256')
  hash.update(JSON.stringify(snapshot.nodes))
  hash.update(JSON.stringify(snapshot.edges))
  hash.update(JSON.stringify(snapshot.findings))
  return `sha256:${hash.digest('hex')}`
}

export const baselineCommand = defineCommand({
  meta: {
    name: 'baseline',
    description:
      'Scan the project and snapshot the result as the baseline for future validate_diff ' +
      'comparisons. Writes .vibegraph/cache/baseline.json atomically.',
  },
  args: {
    root: { type: 'string', description: 'Project root override (default: cwd)' },
    json: { type: 'boolean', default: false },
    quiet: { type: 'boolean', default: false },
  },
  async run({ args }) {
    const log = createCliLogger({ json: args.json, quiet: args.quiet })
    const projectRoot = await resolveProjectRoot({
      explicit: args.root,
      cwd: process.cwd(),
    })

    // Always scan first: the hook nudge tells users to run `vibe-graph baseline`,
    // so it must work without a prior scan, and baselining a stale graph.json
    // would make every later edit report the whole drift since then as new.
    try {
      await runOneShotScan({ root: projectRoot, log })
    } catch (err) {
      log.error({ error: (err as Error).message }, 'baseline failed: scan failed')
      process.exitCode = 1
      return
    }

    const result = await runBaseline({ projectRoot })
    if (result.status === 'error') {
      log.error({ error: result.error }, 'baseline failed')
      process.exitCode = 1
      return
    }
    log.info(
      { baselinePath: result.baselinePath, snapshotId: result.snapshotId },
      `Baseline set from snapshot ${result.snapshotId}`,
    )
  },
})
