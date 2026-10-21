import { resolve } from 'node:path'
import {
  type ContextPack,
  type LoadedSnapshot,
  buildContextPack,
  createIgnoreMatcher,
  createSnapshotReader,
  resolveProjectRoot,
  resolveTarget,
  scan,
  writeSnapshotAtomic,
} from '@codearch/core'
import { defineCommand } from 'citty'
import { createCliLogger } from '../logger.js'

// ── Public helper (exported for unit testing) ──────────────────────────────────

export interface RunContextInput {
  target: string
  maxTokens: number
  maxFiles: number
  projectRoot: string
  intent?: string
}

/**
 * Pure helper: resolve `input.target` in `loaded` and call `buildContextPack`.
 * Throws on unknown/ambiguous target.
 * Exported so unit tests can exercise the core logic without spawning a CLI process.
 */
export async function runContext(
  loaded: LoadedSnapshot,
  input: RunContextInput,
): Promise<ContextPack> {
  const resolved = resolveTarget(loaded, input.target)
  if ('error' in resolved) {
    const reason =
      resolved.error === 'AMBIGUOUS'
        ? `target '${input.target}' is ambiguous — candidates: ${resolved.candidates.join(', ')}`
        : `target '${input.target}' not found — try: ${resolved.candidates.join(', ')}`
    throw new Error(reason)
  }

  const ignore = createIgnoreMatcher({ patterns: [], includeDefaults: true })

  return buildContextPack(loaded, {
    target: resolved.id,
    maxTokens: input.maxTokens,
    maxFiles: input.maxFiles,
    projectRoot: input.projectRoot,
    ignore,
    ...(input.intent !== undefined ? { intent: input.intent } : {}),
  })
}

// ── Exported for unit testing ──────────────────────────────────────────────────

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

// ── citty command ──────────────────────────────────────────────────────────────

export const contextCommand = defineCommand({
  meta: {
    name: 'context',
    description: 'Build a token-budgeted context pack for a target node',
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
    'max-tokens': { type: 'string', description: 'Token budget (default 8000)' },
    'max-files': { type: 'string', description: 'File budget (default 10)' },
    intent: { type: 'string', description: 'Free-form hint (currently informational)' },
  },
  async run({ args }) {
    // In --json mode the raw pack is written to stdout; the logger MUST go to
    // stderr so the output remains parseable by tools — same pattern as mcp.ts.
    const log = createCliLogger({
      json: args.json,
      quiet: args.quiet,
      ...(args.json ? { destination: process.stderr } : {}),
    })

    const explicitRoot = typeof args.root === 'string' ? args.root : undefined
    const projectRoot = await resolveProjectRoot({
      explicit: explicitRoot,
      cwd: process.cwd(),
    })
    const snapshotPath = resolve(projectRoot, '.vibegraph/cache/graph.json')

    // Auto-scan when graph.json is missing, then read the snapshot.
    const reader = createSnapshotReader({
      snapshotPath,
      autoScanOnMissing: true,
      triggerScan: async () => {
        log.info({ projectRoot }, 'context: no graph.json — running scan first')
        const snap = await scan({ root: projectRoot })
        await writeSnapshotAtomic(snapshotPath, snap)
      },
    })

    const loaded = await reader.get()

    // Validate budgets before touching the graph.
    const maxTokens = parsePositiveInt(args['max-tokens'], 8000)
    const maxFiles = parsePositiveInt(args['max-files'], 10)
    if (maxTokens === null || maxFiles === null) {
      log.error(
        { maxTokens: args['max-tokens'], maxFiles: args['max-files'] },
        'context: --max-tokens and --max-files must be positive integers',
      )
      process.exitCode = 1
      return
    }

    // Resolve the target — give a helpful error if ambiguous or not found.
    const resolveResult = resolveTarget(loaded, args.target)
    if ('error' in resolveResult) {
      const reason =
        resolveResult.error === 'AMBIGUOUS'
          ? `target '${args.target}' is ambiguous — multiple matches: ${resolveResult.candidates.join(', ')}`
          : `target '${args.target}' not found — try: ${resolveResult.candidates.join(', ')}`
      log.error({ target: args.target, candidates: resolveResult.candidates }, reason)
      process.exitCode = 1
      return
    }

    const ignore = createIgnoreMatcher({ patterns: [], includeDefaults: true })

    const pack = await buildContextPack(loaded, {
      target: resolveResult.id,
      maxTokens,
      maxFiles,
      projectRoot,
      ignore,
      ...(typeof args.intent === 'string' ? { intent: args.intent } : {}),
    })

    if (args.json) {
      // Bypass pino — write raw JSON directly to stdout so callers can parse it.
      process.stdout.write(`${JSON.stringify(pack, null, 2)}\n`)
    } else {
      renderHuman(pack, log)
    }
  },
})

// ── Human-readable renderer ────────────────────────────────────────────────────

function renderHuman(pack: ContextPack, log: ReturnType<typeof createCliLogger>): void {
  log.info(
    { target: pack.target, estimatedTokens: pack.estimatedTokens, tokenBudget: pack.tokenBudget },
    `Context pack for ${pack.target}`,
  )
  log.info(`Summary: ${pack.summary}`)

  if (pack.facts.length > 0) {
    log.info(`Facts (${pack.facts.length}):`)
    for (const f of pack.facts) {
      log.info(`  • [${f.kind}] ${f.text}`)
    }
  }

  if (pack.criticalFiles.length > 0) {
    log.info(`Critical files (${pack.criticalFiles.length}):`)
    for (const f of pack.criticalFiles) {
      const hasExcerpt = typeof f.excerpt === 'string' && f.excerpt.length > 0
      log.info(`  • ${f.path} (${f.role})${hasExcerpt ? '' : ' [excerpt omitted — over budget]'}`)
    }
  }

  if (pack.relationships.length > 0) {
    log.info(`Relationships (${pack.relationships.length}):`)
    for (const r of pack.relationships) {
      log.info(`  ${r.from} -[${r.kind}]→ ${r.to} (${r.confidence}, ${r.evidenceCount} evidence)`)
    }
  }

  if (pack.blastRadius.length > 0) {
    log.info(`Blast radius (${pack.blastRadius.length}): ${pack.blastRadius.join(', ')}`)
  }

  if (pack.metadata.redactions !== undefined && pack.metadata.redactions.totalCount > 0) {
    log.warn(
      { redactions: pack.metadata.redactions },
      `${pack.metadata.redactions.totalCount} secrets redacted`,
    )
  }
}
