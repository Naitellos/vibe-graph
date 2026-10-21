import { createHash } from 'node:crypto'
import { existsSync } from 'node:fs'
import { readFile } from 'node:fs/promises'
import { join } from 'node:path'
import type { IgnoreMatcher } from '../analyzers/ignore-matcher.js'
import { isDependencyEdge } from '../graph/edge-categories.js'
import type { ContextPack } from '../schema/context-pack.js'
import { ContextPackSchema } from '../schema/context-pack.js'
import type { LoadedSnapshot } from '../snapshot/load-snapshot.js'
import { computeBlastRadius } from './blast-radius.js'
import { estimateTokens } from './estimate-tokens.js'
import { pickCriticalFiles } from './pick-critical-files.js'
import { redactSecrets } from './redact-secrets.js'

export interface BuildContextPackInput {
  /** Target node id (subsystem, file, package, external). */
  target: string
  /** Token budget. Default 8000. */
  maxTokens?: number
  /** Max files to consider for criticalFiles. Default 10. */
  maxFiles?: number
  /** Project root for resolving file paths to read excerpts. */
  projectRoot: string
  /** Ignore matcher — file excerpts skip ignored files. */
  ignore: IgnoreMatcher
  /**
   * Optional intent (free-form hint string, currently unused —
   * reserved for v1 LLM-driven prioritization).
   */
  intent?: string
}

export async function buildContextPack(
  snapshot: LoadedSnapshot,
  input: BuildContextPackInput,
): Promise<ContextPack> {
  // ── Step 1: Validate target ──────────────────────────────────────────────────
  const targetNode = snapshot.nodesById.get(input.target)
  if (!targetNode) {
    throw new Error(`TARGET_NOT_FOUND: ${input.target}`)
  }

  // ── Step 2: Budget split ─────────────────────────────────────────────────────
  const tokenBudget = input.maxTokens ?? 8000
  // structuralBudget is 30% — used for summary, facts, relationships, blastRadius
  const structuralBudget = Math.floor(tokenBudget * 0.3)
  void structuralBudget // heuristic only; we cap at 20 relationships / 20 blast nodes
  const filesBudget = Math.floor(tokenBudget * 0.7)

  // ── Step 3: Summary ──────────────────────────────────────────────────────────
  const target = input.target

  // Incoming dep edges = things that depend on this node (its consumers)
  const incomingDepEdges = (snapshot.edgesByTargetId.get(target) ?? []).filter(isDependencyEdge)
  const incomingCount = incomingDepEdges.length

  // Outgoing dep edges = things this node depends on
  const outgoingDepEdges = (snapshot.edgesByNodeId.get(target) ?? []).filter(isDependencyEdge)
  const outgoingCount = outgoingDepEdges.length

  const summary = `${targetNode.title} (${targetNode.kind}). ${incomingCount} consumers, ${outgoingCount} dependencies.`

  // ── Step 4: Facts ────────────────────────────────────────────────────────────
  const facts: Array<{ kind: string; text: string; nodeIds: string[] }> = []

  if (incomingCount > 0) {
    facts.push({
      kind: 'fan-in',
      text: `${incomingCount} subsystems depend on this`,
      nodeIds: [target],
    })
  }

  if (outgoingCount > 0) {
    facts.push({
      kind: 'fan-out',
      text: `this depends on ${outgoingCount} subsystems`,
      nodeIds: [target],
    })
  }

  // Findings that involve this target (cap at 5)
  const relevantFindings = snapshot.raw.findings
    .filter((f) => f.involvedNodeIds.includes(target))
    .slice(0, 5)

  for (const finding of relevantFindings) {
    facts.push({
      kind: 'finding',
      text: finding.title,
      nodeIds: finding.involvedNodeIds,
    })
  }

  // ── Step 5: Relationships ────────────────────────────────────────────────────
  const allDepEdges = [...outgoingDepEdges, ...incomingDepEdges]
  const relationships = allDepEdges.slice(0, 20).map((edge) => ({
    from: edge.from,
    to: edge.to,
    kind: edge.kind,
    confidence: edge.confidence,
    evidenceCount: edge.evidenceIds.length,
  }))

  // ── Step 6: Blast radius ─────────────────────────────────────────────────────
  const radius = computeBlastRadius(snapshot, target, { maxDepth: 5 })
  const blastRadius = [...radius.direct, ...radius.transitive].slice(0, 20)

  // ── Step 7: Critical files with excerpts ─────────────────────────────────────
  const pickedFiles = pickCriticalFiles(snapshot, target, { maxFiles: input.maxFiles ?? 10 })

  interface FileEntry {
    path: string
    role: string
    excerpt: string | undefined
  }

  interface AggregatedRedactions {
    totalCount: number
    byKind: Record<string, number>
  }

  const aggregatedRedactions: AggregatedRedactions = { totalCount: 0, byKind: {} }

  // Read all file excerpts and redact
  const fileEntries: FileEntry[] = []
  for (const file of pickedFiles) {
    const absPath = join(input.projectRoot, file.path)
    if (!existsSync(absPath) || input.ignore.ignores(file.path)) {
      fileEntries.push({ path: file.path, role: file.role, excerpt: undefined })
      continue
    }

    const content = await readFile(absPath, 'utf-8')
    const rawExcerpt = content.split('\n').slice(0, 40).join('\n')
    const { text: redactedExcerpt, redactions } = redactSecrets(rawExcerpt)

    // Aggregate redactions
    if (redactions.totalCount > 0) {
      aggregatedRedactions.totalCount += redactions.totalCount
      for (const [kind, count] of Object.entries(redactions.byKind)) {
        aggregatedRedactions.byKind[kind] =
          (aggregatedRedactions.byKind[kind] ?? 0) + (count as number)
      }
    }

    fileEntries.push({ path: file.path, role: file.role, excerpt: redactedExcerpt })
  }

  // Token budget enforcement for files — drop last excerpts until under budget
  // We work backward: drop the lowest-priority file's excerpt first.
  let lastExcerptIdx = fileEntries.length - 1

  const totalFileTokens = (): number =>
    estimateTokens({ excerpts: fileEntries.map((f) => f.excerpt ?? '').join('\n') })

  while (totalFileTokens() > filesBudget && lastExcerptIdx >= 0) {
    const entry = fileEntries[lastExcerptIdx]
    if (entry) entry.excerpt = undefined
    lastExcerptIdx--
  }

  // Build criticalFiles in schema format
  const criticalFiles = fileEntries.map((f) => ({
    path: f.path,
    role: f.role,
    ...(f.excerpt !== undefined ? { excerpt: f.excerpt } : {}),
  }))

  // ── Step 8: Assemble ContextPack ─────────────────────────────────────────────
  const scanId = snapshot.raw.meta.scanId
  const id = `ctx_${createHash('sha256')
    .update(`${target}|${tokenBudget}|${scanId}`)
    .digest('hex')
    .slice(0, 16)}`

  // Estimate total tokens across all content
  const estimatedTokens = estimateTokens({
    summary,
    facts: facts.map((f) => f.text),
    criticalFileExcerpts: criticalFiles.map((f) => f.excerpt ?? ''),
    relationships: relationships.map((r) => `${r.from}->${r.to}`),
    blastRadius,
  })

  const raw = {
    id,
    target,
    tokenBudget,
    estimatedTokens,
    tokenEstimateMethod: 'char-div-4' as const,
    summary,
    facts,
    criticalFiles,
    relationships,
    blastRadius,
    recommendations: [],
    tests: [],
    doNotDo: [],
    metadata: {
      redactions: aggregatedRedactions.totalCount > 0 ? aggregatedRedactions : undefined,
    },
  }

  return ContextPackSchema.parse(raw)
}
