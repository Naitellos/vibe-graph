import { TaskError } from '../errors/task-error.js'
import { computeBlastRadius } from '../helpers/blast-radius.js'
import { buildConformance, collectNewCoupling } from '../helpers/conformance.js'
import {
  computeAffectedNodeIds,
  computeFindingsDelta,
  computeGraphDelta,
  isFindingInScope,
  scopeGraphDelta,
} from '../helpers/delta.js'
import { parseGitNameStatus, runGitDiff } from '../helpers/git-diff.js'
import { loadGraphBaseline } from '../helpers/graph-baseline-store.js'
import { loadTaskSession } from '../helpers/task-session-store.js'
import {
  type ValidateDiffInput,
  type ValidateDiffOutput,
  ValidateDiffOutputSchema,
} from '../schema/diff-validation.js'
import type { Edge } from '../schema/edge.js'
import type { Finding } from '../schema/finding.js'
import type { GraphBaseline } from '../schema/graph-baseline.js'
import type { Node } from '../schema/node.js'
import type { TaskSession } from '../schema/prepare-task.js'
import { type LoadedSnapshot, buildLoadedSnapshot } from '../snapshot/load-snapshot.js'
import { parseDiffText } from './parser.js'
import { type WorkingGraph, buildWorkingGraph } from './working-graph.js'

/**
 * Dependencies for {@link validateDiff}. The orchestration needs the already-loaded
 * snapshot (the caller decides how to read it — MCP via SnapshotReader, CLI via its
 * own loader) plus the project root used to locate the baseline, task sessions, and
 * run `git diff`.
 */
export interface ValidateDiffDeps {
  snapshot: LoadedSnapshot
  projectRoot: string
}

/**
 * Verify a code change against the project baseline.
 *
 * Behavior-preserving extraction of the orchestration that previously lived inside
 * the MCP `validate_diff` tool handler. Both the MCP tool and (later) the CLI HTTP
 * route call this single implementation.
 *
 * On error conditions (no baseline, stale/missing task session, oversized diff,
 * git unavailable) this throws {@link TaskError}; callers wrap it into their own
 * error surface (the MCP tool maps TaskError → ToolError).
 */
export async function validateDiff(
  input: ValidateDiffInput,
  deps: ValidateDiffDeps,
): Promise<ValidateDiffOutput> {
  const { snapshot, projectRoot } = deps
  void snapshot // the snapshot is supplied by the caller; orchestration reads baseline/working state below

  const baseline = await loadGraphBaseline(projectRoot)
  if (!baseline) {
    throw new TaskError(
      'NO_BASELINE',
      'NO_BASELINE: No baseline at .vibegraph/cache/baseline.json. Run `vibe-graph baseline` first.',
    )
  }

  const session = await loadAndValidateTaskSession({
    projectRoot,
    taskId: input.taskId,
    baseline,
  })

  const resolvedFiles = await resolveChangedFiles(projectRoot, input)
  const changedFiles = [...new Set(resolvedFiles.changedFiles.map(normalizePath))]
  const deletedFiles = [...new Set(resolvedFiles.deletedFiles.map(normalizePath))]
  if (changedFiles.length + deletedFiles.length > 200) {
    throw new TaskError(
      'INVALID_INPUT',
      `WORKING_DIFF_TOO_LARGE: Diff covers ${changedFiles.length + deletedFiles.length} files. Run \`vibe-graph scan\` + \`vibe-graph baseline\` to refresh state.`,
    )
  }

  const working = await buildWorkingGraph({ projectRoot, changedFiles, deletedFiles })

  const delta = computeDelta(baseline, working)

  // Scope new/removed findings to "things touched by THIS diff" — without
  // this, findings for files outside `changedFiles` leak through (orphan /
  // drift findings for unrelated parts of the repo appear as new or removed
  // simply because the cached snapshot and the on-the-fly working scan see
  // different subsets of the world). See dogfooding Task 1 + Task 2.
  //
  // Pass baseline + working edges so newly-added/renamed files (absent from
  // baseline `contains` edges) are still mapped to their owning subsystem via
  // the working scan's `contains` edges. See Fix 1.
  const affectedNodeIds = computeAffectedNodeIds(
    [...baseline.edges, ...working.edges],
    changedFiles,
    deletedFiles,
  )
  const scopedGraphDelta = scopeGraphDelta(delta.graphDelta, affectedNodeIds, [
    ...baseline.edges,
    ...working.edges,
  ])
  const plannedFiles = session?.paths.map(normalizePath) ?? []
  const plannedFileSet = new Set(plannedFiles)
  const outOfScopeFiles = session
    ? [...new Set([...changedFiles, ...deletedFiles].filter((path) => !plannedFileSet.has(path)))]
    : []
  const omittedGraphDelta = graphDeltaDifference(delta.graphDelta, scopedGraphDelta)

  const affectedSubsystemIds = [...affectedNodeIds].filter((id) => id.startsWith('subsystem:'))
  const blastRadiusDelta = computeBlastRadiusDelta(baseline, working, affectedSubsystemIds)
  const inScope = (f: Finding) => isFindingInScope(f, affectedNodeIds)

  // Split rule findings (domain === 'rule') into newViolations / removedViolations;
  // the remainder go into newFindings / removedFindings. Each split array is
  // then scoped to changes related to the input diff.
  const newViolations = delta.newFindings.filter((f) => f.domain === 'rule').filter(inScope)
  const removedViolations = delta.removedFindings.filter((f) => f.domain === 'rule').filter(inScope)
  const newOtherFindings = delta.newFindings.filter((f) => f.domain !== 'rule').filter(inScope)
  const removedOtherFindings = delta.removedFindings
    .filter((f) => f.domain !== 'rule')
    .filter(inScope)

  // Diff-derived synthetic findings: a new cross-subsystem coupling edge.
  // Already scoped via affectedNodeIds + type-only-safe (see collectNewCoupling).
  // Coupling is determined solely by isRuntimeCouplingEdge — type-only edges never
  // appear as new-coupling. `undeclared` drift findings are NOT counted as coupling.
  const newCoupling = collectNewCoupling(scopedGraphDelta, affectedNodeIds)
  const allNewFindings = [...newOtherFindings, ...newCoupling]

  let status = summariseStatus({
    newFindings: allNewFindings,
    newViolations,
    mode: input.mode,
  })
  if (status === 'ok' && outOfScopeFiles.length > 0) status = 'warn'

  // Use allNewFindings (which includes synthetic new-coupling) so the count
  // reflects what is actually returned in `newFindings`. (Fix 3)
  const resolvedCount = removedViolations.length + removedOtherFindings.length
  const changedFileCount = changedFiles.length + deletedFiles.length
  const summary =
    `${allNewFindings.length} new/worsened finding(s), ` +
    `${resolvedCount} resolved, ` +
    `${scopedGraphDelta.newEdges.length} new edge(s) ` +
    `within ${changedFileCount} changed file(s).`

  const conformance = buildConformance(allNewFindings, newViolations)

  const recommendations: string[] = []
  if (allNewFindings.some((f) => f.severity === 'high')) {
    recommendations.push('High-severity finding introduced — review before committing.')
  }
  // Only recommend when at least one affected subsystem's blast radius
  // ACTUALLY changed. With P1.03 every affected subsystem produces a key
  // (even when delta=0), so checking keys.length always triggers — wrong
  // signal. Trigger on a real non-zero delta. (DF3.01)
  const hasBlastRadiusChange = Object.values(blastRadiusDelta.blastRadius).some(
    (v) => v.delta !== '0',
  )
  if (hasBlastRadiusChange) {
    recommendations.push('Blast radius of one or more subsystems changed — verify dependents.')
  }
  if (outOfScopeFiles.length > 0) {
    recommendations.push(
      `${outOfScopeFiles.length} changed file(s) were not declared by prepare_task: ${formatPathList(outOfScopeFiles)}. Re-run prepare_task with the complete file list or review these changes separately.`,
    )
  }
  if (Object.values(omittedGraphDelta).some((count) => count > 0)) {
    recommendations.push(
      'Unrelated baseline drift was omitted from this task-scoped result; use validate_drift to inspect repository-wide drift separately.',
    )
  }

  return ValidateDiffOutputSchema.parse({
    taskId: session?.taskId ?? input.taskId,
    status,
    summary,
    newViolations,
    removedViolations,
    newFindings: allNewFindings,
    removedFindings: removedOtherFindings,
    graphDelta: scopedGraphDelta,
    scope: {
      taskLinked: session !== null,
      plannedFiles,
      changedFiles: changedFiles.map(normalizePath),
      deletedFiles: deletedFiles.map(normalizePath),
      outOfScopeFiles,
      omittedGraphDelta,
    },
    riskDelta: blastRadiusDelta,
    recommendations,
    missingTests: [],
    baselineSnapshotId: baseline.snapshotId,
    conformance,
  })
}

function normalizePath(path: string): string {
  return path.replaceAll('\\', '/').replace(/^\.\//, '')
}

function formatPathList(paths: string[]): string {
  const shown = paths.slice(0, 5)
  const remainder = paths.length - shown.length
  return `${shown.join(', ')}${remainder > 0 ? `, and ${remainder} more` : ''}`
}

function graphDeltaDifference(
  total: ComputeDeltaResult['graphDelta'],
  scoped: ComputeDeltaResult['graphDelta'],
): { newEdges: number; removedEdges: number; newNodes: number; removedNodes: number } {
  return {
    newEdges: total.newEdges.length - scoped.newEdges.length,
    removedEdges: total.removedEdges.length - scoped.removedEdges.length,
    newNodes: total.newNodes.length - scoped.newNodes.length,
    removedNodes: total.removedNodes.length - scoped.removedNodes.length,
  }
}

export interface ComputeDeltaResult {
  newFindings: Finding[]
  removedFindings: Finding[]
  graphDelta: {
    newEdges: Edge[]
    removedEdges: Edge[]
    newNodes: Node[]
    removedNodes: Node[]
  }
}

// Exported for direct unit testing (validate-diff.test.ts). Intentionally NOT
// re-exported through the package barrel (`index.ts`) — only `validateDiff`
// itself is public surface; these remain internal helpers of the orchestration.
export function computeDelta(baseline: GraphBaseline, working: WorkingGraph): ComputeDeltaResult {
  const { newFindings, removedFindings } = computeFindingsDelta(baseline.findings, working.findings)
  const graphDelta = computeGraphDelta(baseline, working)
  return { newFindings, removedFindings, graphDelta }
}

export async function loadAndValidateTaskSession(opts: {
  projectRoot: string
  taskId?: string
  baseline: GraphBaseline
}): Promise<TaskSession | null> {
  if (opts.taskId === undefined) return null

  const session = await loadTaskSession(opts.projectRoot, opts.taskId)
  if (!session) {
    throw new TaskError(
      'INVALID_INPUT',
      `TASK_SESSION_NOT_FOUND: No prepare_task session found for ${opts.taskId}.`,
      'Run prepare_task again and pass the returned taskId to validate_diff.',
    )
  }

  if (session.baselineSnapshotId !== opts.baseline.snapshotId) {
    throw new TaskError(
      'SNAPSHOT_STALE',
      `SNAPSHOT_STALE: Task ${opts.taskId} was prepared against baseline ${session.baselineSnapshotId}, but current baseline is ${opts.baseline.snapshotId}.`,
      'Run prepare_task again, or restore the matching baseline before validating this task.',
    )
  }

  return session
}

/**
 * Status verdict for a validate_diff result.
 *
 * Per-rule mode semantics (per-rule `metadata.mode` always wins over input `mode`):
 * - `advisory` violations are reported in `newViolations` but do NOT affect status.
 * - `warn` violations set status to at least `'warn'`.
 * - `enforce` violations always escalate status to `'violation'`.
 *
 * When a rule finding lacks `metadata.mode`, the input `mode` is used as the fallback.
 *
 * Non-rule findings (in `newFindings`) follow the original severity-based escalation:
 * high → 'violation', medium/low → 'warn'.
 */
export function summariseStatus(opts: {
  newFindings: Finding[]
  newViolations: Finding[]
  mode: 'advisory' | 'warn' | 'enforce'
}): 'ok' | 'warn' | 'violation' {
  // Resolve effective mode for each violation: per-rule metadata.mode wins,
  // falling back to the input mode.
  const warnViolations = opts.newViolations.filter((v) => {
    const ruleMode = (v.metadata?.mode as string | undefined) ?? opts.mode
    return ruleMode === 'warn'
  })
  const enforceViolations = opts.newViolations.filter((v) => {
    const ruleMode = (v.metadata?.mode as string | undefined) ?? opts.mode
    return ruleMode === 'enforce'
  })
  // advisory violations do not contribute to status at all

  if (enforceViolations.length > 0) return 'violation'

  const hasHigh = opts.newFindings.some((f) => f.severity === 'high')
  if (hasHigh) return 'violation'

  if (warnViolations.length > 0) return 'warn'
  if (opts.newFindings.length > 0) return 'warn'

  return 'ok'
}

// Stub UUID for the ephemeral Snapshot wrappers built from baseline + working.
// buildLoadedSnapshot doesn't call SnapshotSchema.parse, so this never reaches
// validation; we just need a value that satisfies the TS shape.
const EPHEMERAL_SCAN_ID = '00000000-0000-0000-0000-000000000000'

function computeBlastRadiusDelta(
  baseline: GraphBaseline,
  working: WorkingGraph,
  affectedSubsystemIds: string[],
): { blastRadius: Record<string, { before: number; after: number; delta: string }> } {
  if (affectedSubsystemIds.length === 0) {
    return { blastRadius: {} }
  }

  const baselineSnap = buildLoadedSnapshot({
    meta: {
      schemaVersion: '0.1.0',
      scanId: EPHEMERAL_SCAN_ID,
      builtAt: baseline.createdAt,
      projectRoot: '',
      projectName: '',
      vibegraphVersion: '0.0.0',
      scanDurationMs: 0,
      fileCounts: { scanned: 0, indexed: 0, skipped: 0 },
    },
    nodes: baseline.nodes,
    edges: baseline.edges,
    evidence: [],
    findings: baseline.findings,
  })
  const workingSnap = buildLoadedSnapshot({
    meta: {
      schemaVersion: '0.1.0',
      scanId: EPHEMERAL_SCAN_ID,
      builtAt: new Date().toISOString(),
      projectRoot: '',
      projectName: '',
      vibegraphVersion: '0.0.0',
      scanDurationMs: 0,
      fileCounts: { scanned: 0, indexed: 0, skipped: 0 },
    },
    nodes: working.nodes,
    edges: working.edges,
    evidence: [],
    findings: working.findings,
  })

  const out: Record<string, { before: number; after: number; delta: string }> = {}
  for (const subsysId of affectedSubsystemIds) {
    const before = computeBlastRadius(baselineSnap, subsysId).totalAffected
    const after = computeBlastRadius(workingSnap, subsysId).totalAffected
    const diff = after - before
    out[subsysId] = {
      before,
      after,
      delta: diff > 0 ? `+${diff}` : diff === 0 ? '0' : `${diff}`,
    }
  }
  return { blastRadius: out }
}

async function resolveChangedFiles(
  projectRoot: string,
  input: ValidateDiffInput,
): Promise<{ changedFiles: string[]; deletedFiles: string[] }> {
  if (input.workingFiles) {
    return { changedFiles: input.workingFiles, deletedFiles: [] }
  }
  if (input.diff) {
    const parsed = parseDiffText(input.diff)
    return {
      changedFiles: [...parsed.added, ...parsed.modified, ...parsed.renamed.map((r) => r.to)],
      deletedFiles: parsed.deleted,
    }
  }
  try {
    const stdout = await runGitDiff(projectRoot, 'HEAD')
    return parseGitNameStatus(stdout)
  } catch (err) {
    throw new TaskError(
      'INVALID_INPUT',
      `GIT_NOT_AVAILABLE: Could not run git diff in ${projectRoot}: ${(err as Error).message}. Pass diff or workingFiles explicitly.`,
    )
  }
}
