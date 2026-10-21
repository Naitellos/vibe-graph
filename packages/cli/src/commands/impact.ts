import { resolve } from 'node:path'
import {
  type LoadedSnapshot,
  computeBlastRadius,
  createSnapshotReader,
  resolveProjectRoot,
  resolveTarget,
  scan,
  writeSnapshotAtomic,
} from '@codearch/core'
import { defineCommand } from 'citty'
import { createCliLogger } from '../logger.js'

export const impactCommand = defineCommand({
  meta: {
    name: 'impact',
    description: 'Print the blast radius for a node id or file path',
  },
  args: {
    target: {
      type: 'positional',
      description: 'Node id, file path, or title',
      required: true,
    },
    root: { type: 'string', description: 'Project root override (default: cwd)' },
    json: { type: 'boolean', description: 'Output raw JSON', default: false },
    quiet: { type: 'boolean', default: false },
    'max-depth': { type: 'string', description: 'Max BFS depth (default 5)' },
  },
  async run({ args }) {
    // In --json mode, route logger to stderr so stdout stays clean for JSON.
    const log = createCliLogger({
      json: args.json,
      quiet: args.quiet,
      destination: args.json ? process.stderr : process.stdout,
    })

    const explicitRoot = typeof args.root === 'string' ? args.root : undefined
    const projectRoot = await resolveProjectRoot({
      explicit: explicitRoot,
      cwd: process.cwd(),
    })
    const snapshotPath = resolve(projectRoot, '.vibegraph/cache/graph.json')

    const reader = createSnapshotReader({
      snapshotPath,
      autoScanOnMissing: true,
      triggerScan: async () => {
        log.info({ projectRoot }, 'impact: no graph.json — running scan first')
        const snap = await scan({ root: projectRoot })
        await writeSnapshotAtomic(snapshotPath, snap)
      },
    })

    const loaded = await reader.get()

    const maxDepth = parsePositiveInt(args['max-depth'], 5)
    if (maxDepth === null) {
      log.error({ maxDepth: args['max-depth'] }, 'impact: --max-depth must be a positive integer')
      process.exitCode = 1
      return
    }

    const radius = runImpact(loaded, { target: args.target, maxDepth })
    if ('error' in radius) {
      const reason =
        radius.error === 'TARGET_AMBIGUOUS'
          ? `target '${args.target}' is ambiguous — multiple matches: ${radius.candidates.join(', ')}`
          : `target '${args.target}' not found — try: ${radius.candidates.join(', ')}`
      log.error({ target: args.target, candidates: radius.candidates }, reason)
      process.exitCode = 1
      return
    }

    if (args.json) {
      process.stdout.write(`${JSON.stringify(radius, null, 2)}\n`)
    } else {
      renderHuman(radius, args.target, log)
    }
  },
})

export interface RunImpactInput {
  target: string
  maxDepth: number
}

export interface RunImpactSuccess {
  target: { nodeId: string; title: string; kind: string }
  direct: string[]
  transitive: string[]
  cycles: string[]
  totalAffected: number
}

export interface RunImpactError {
  error: 'TARGET_NOT_FOUND' | 'TARGET_AMBIGUOUS'
  candidates: string[]
}

export type RunImpactResult = RunImpactSuccess | RunImpactError

/** Pure helper for testing — resolves target, runs computeBlastRadius. */
export function runImpact(loaded: LoadedSnapshot, input: RunImpactInput): RunImpactResult {
  const resolved = resolveTarget(loaded, input.target)
  if ('error' in resolved) {
    return {
      error: resolved.error === 'AMBIGUOUS' ? 'TARGET_AMBIGUOUS' : 'TARGET_NOT_FOUND',
      candidates: resolved.candidates,
    }
  }
  const radius = computeBlastRadius(loaded, resolved.id, { maxDepth: input.maxDepth })
  return {
    target: { nodeId: resolved.id, title: resolved.title, kind: resolved.kind },
    direct: radius.direct,
    transitive: radius.transitive,
    cycles: radius.cycles,
    totalAffected: radius.totalAffected,
  }
}

/**
 * Parse a citty string arg as a positive integer.
 *
 * Returns:
 *   - `fallback`  if `input` is `undefined` or `''` (arg not supplied)
 *   - parsed int  if `input` is a string containing a positive integer
 *   - `null`      on any parse error (caller should reject with exitCode=1)
 */
export function parsePositiveInt(input: unknown, fallback: number): number | null {
  if (input === undefined || input === '') return fallback
  if (typeof input !== 'string') return null
  const n = Number(input)
  if (!Number.isInteger(n) || n <= 0) return null
  return n
}

function renderHuman(
  result: RunImpactSuccess,
  rawTarget: string,
  log: ReturnType<typeof createCliLogger>,
): void {
  log.info(
    { target: result.target, totalAffected: result.totalAffected },
    `Blast radius for ${result.target.title} (${result.target.nodeId})`,
  )
  log.info(`Total affected: ${result.totalAffected}`)
  if (result.direct.length > 0) {
    log.info(`Direct consumers (${result.direct.length}): ${result.direct.join(', ')}`)
  }
  if (result.transitive.length > 0) {
    log.info(`Transitive (${result.transitive.length}): ${result.transitive.join(', ')}`)
  }
  if (result.cycles.length > 0) {
    log.warn(
      { cycles: result.cycles },
      `Cycle co-participants (${result.cycles.length}): ${result.cycles.join(', ')}`,
    )
  }
  // Silence the unused-target warning while preserving signature parity with renderHuman in context.ts
  void rawTarget
}
