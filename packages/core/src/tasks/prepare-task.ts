import { type LoadedConfig, loadConfig } from '../config/config-yml.js'
import { TaskError } from '../errors/task-error.js'
import { computeBlastRadius } from '../helpers/blast-radius.js'
import { isFindingInScope } from '../helpers/delta.js'
import { loadGraphBaseline } from '../helpers/graph-baseline-store.js'
import { pickCriticalFiles } from '../helpers/pick-critical-files.js'
import { generateTaskId } from '../helpers/task-session-store.js'
import {
  type PrepareTaskInput,
  type PrepareTaskOutput,
  PrepareTaskOutputSchema,
} from '../schema/prepare-task.js'
import type { LoadedSnapshot } from '../snapshot/load-snapshot.js'
import {
  formatRuleAsDoNotDo,
  humanizeBuiltinTitle,
  isForbiddingRule,
  isRuleApplicableToSubsystems,
} from './prepare-task-rules.js'

/** Optional loader override — pass in tests to inject a custom LoadedConfig. */
export type LoadConfigFn = (projectRoot: string) => Promise<LoadedConfig>

export interface PrepareTaskContext {
  snapshot: LoadedSnapshot
  /** Defaults to new Date() if omitted — tests inject for deterministic IDs. */
  now?: Date
  /**
   * Override for loadConfig — used in tests to inject custom rule sets without
   * hitting the real filesystem. Defaults to `loadConfig` from @codearch/core.
   */
  overrideLoadConfig?: LoadConfigFn
}

/**
 * Resolve target → collect blast radius + findings + critical files + rules →
 * assemble PrepareTaskOutput.
 *
 * NOTE: This function performs I/O beyond the snapshot: it re-loads the project
 * config (via loadConfig) to obtain the effective rule set (DEFAULT_BUILTIN_RULES
 * merged with user-defined rules). This is cheap and idempotent; the tradeoff
 * makes the function self-contained without requiring callers to pass config.
 */
export async function prepareTask(
  input: PrepareTaskInput,
  ctx: PrepareTaskContext,
): Promise<PrepareTaskOutput> {
  const now = ctx.now ?? new Date()
  const { snapshot, overrideLoadConfig } = ctx

  const targetSubsystems = resolveTargetSubsystems(snapshot, input.paths)
  if (targetSubsystems.length === 0) {
    throw new TaskError(
      'TARGET_NOT_FOUND',
      `NO_MATCHING_SUBSYSTEM: None of the paths matched any subsystem: ${input.paths.join(', ')}. Verify the paths exist and the project has a configured subsystem covering them.`,
      'Check available subsystems via get_project_overview',
    )
  }

  const projectRoot = snapshot.raw.meta.projectRoot
  const baseline = await loadGraphBaseline(projectRoot)
  const baselineSnapshotId = baseline?.snapshotId ?? snapshot.raw.meta.scanId

  const targetSubsystemIds = new Set(targetSubsystems.map((s) => `subsystem:${s}`))

  // Collect open findings for target subsystems using the pre-built index,
  // THEN narrow to findings whose involvedNodeIds overlap with the target
  // files OR target subsystems. Pre-fix (P2.05): every open finding in the
  // target subsystem surfaced, including ones about unrelated sibling
  // files. Now: file-level findings for files the user isn't touching are
  // dropped; subsystem-level findings (drift, cycles) that mention the
  // target subsystem still surface — those are real risks the agent's
  // change might affect.
  const activeFindings = collectActiveFindings(snapshot, targetSubsystemIds)
  const targetFileIds = new Set(input.paths.map((p) => `file:${p}`))
  const scopeNodeIds = new Set<string>([...targetSubsystemIds, ...targetFileIds])

  const risks = activeFindings
    .filter((f) => isFindingInScope(f, scopeNodeIds))
    .map((f) => ({
      severity: f.severity,
      title: f.title,
      involvedNodeIds: f.involvedNodeIds,
    }))

  const dependentCount = aggregateBlastRadius(snapshot, targetSubsystemIds)
  if (dependentCount >= 5) {
    risks.unshift({
      severity: dependentCount >= 10 ? ('high' as const) : ('medium' as const),
      title: `High blast radius: ${dependentCount} transitive dependents`,
      involvedNodeIds: [...targetSubsystemIds],
    })
  }

  const criticalFiles = collectCriticalFiles(snapshot, targetSubsystemIds, input.paths)
  const colocatedTests = collectColocatedTests(snapshot, input.paths)

  // Load effective rule set (DEFAULT_BUILTIN_RULES merged with user-defined rules).
  const configLoader = overrideLoadConfig ?? loadConfig
  const { config: loadedConfig } = await configLoader(projectRoot)

  const applicableRules = loadedConfig.rules.filter((rule) =>
    isRuleApplicableToSubsystems(rule, targetSubsystemIds),
  )

  const rules = applicableRules.map((rule) => ({
    id: rule.id,
    title: rule.kind === 'builtin' && !rule.title ? humanizeBuiltinTitle(rule) : rule.title,
    severity: rule.severity,
    mode: rule.mode,
  }))

  const doNotDo = applicableRules
    .filter((rule) => isForbiddingRule(rule))
    .map((rule) => formatRuleAsDoNotDo(rule))

  const summary = `Working on ${targetSubsystems.join(', ')} (${dependentCount} transitive dependents, ${activeFindings.length} active findings).`

  const recommendations: string[] = []
  if (activeFindings.length > 0) {
    recommendations.push(
      `Address or accept the ${activeFindings.length} active finding(s) on ${targetSubsystems.join(', ')} before editing.`,
    )
  }
  if (dependentCount >= 10) {
    recommendations.push(
      `Blast radius is large (${dependentCount} consumers). Verify dependents have tests covering current behavior.`,
    )
  }

  return PrepareTaskOutputSchema.parse({
    taskId: generateTaskId(now),
    createdAt: now.toISOString(),
    target: { subsystems: targetSubsystems, files: input.paths },
    summary,
    risks,
    rules,
    doNotDo,
    requiredContext: {
      files: criticalFiles,
      schemaTables: [],
      relatedAdrs: [],
    },
    recommendations,
    tests: colocatedTests,
    baselineSnapshotId,
  })
}

function resolveTargetSubsystems(snapshot: LoadedSnapshot, paths: string[]): string[] {
  const subsystemIds = new Set<string>()

  for (const p of paths) {
    const incomingEdges = snapshot.edgesByTargetId.get(`file:${p}`) ?? []
    for (const edge of incomingEdges) {
      if (edge.kind !== 'contains') continue
      if (!edge.from.startsWith('subsystem:')) continue
      subsystemIds.add(edge.from.replace(/^subsystem:/, ''))
    }
  }

  return [...subsystemIds].sort()
}

// Pattern: any file whose path looks like a test colocated with source code.
// Catches both `foo.test.ts` / `foo.spec.ts` siblings and `__tests__/foo.ts`.
const TEST_FILE_PATTERN = /(\.test|\.spec)\.[mc]?[jt]sx?$|\/__tests__\//

/**
 * P2.06 — derive `tests[]` from reverse-1-hop `imports` edges onto each
 * target file. A file that imports a target AND has a test-like path is
 * almost certainly its test. Skips colocated tests that the agent might
 * inspect but don't directly import the target (those are picked up by
 * requiredContext's reverse-1-hop logic already; this list is the narrower
 * "you should probably update these tests" signal).
 */
function collectColocatedTests(snapshot: LoadedSnapshot, targetPaths: string[]): string[] {
  const seen = new Set<string>()
  const out: string[] = []
  const targetIds = new Set(targetPaths.map((p) => `file:${p}`))

  for (const targetId of targetIds) {
    const incoming = snapshot.edgesByTargetId.get(targetId) ?? []
    for (const e of incoming) {
      if (e.kind !== 'imports') continue
      if (!e.from.startsWith('file:')) continue
      const path = e.from.replace(/^file:/, '')
      if (!TEST_FILE_PATTERN.test(path)) continue
      if (seen.has(path)) continue
      seen.add(path)
      out.push(path)
    }
  }

  return out
}

function collectActiveFindings(snapshot: LoadedSnapshot, targetSubsystemIds: Set<string>) {
  // Use findingsByNodeId index when possible, but deduplicate across nodes
  const seen = new Set<string>()
  const results = []

  for (const nodeId of targetSubsystemIds) {
    const findings = snapshot.findingsByNodeId.get(nodeId) ?? []
    for (const f of findings) {
      if (f.status !== 'open') continue
      if (seen.has(f.id)) continue
      seen.add(f.id)
      results.push(f)
    }
  }

  return results
}

function aggregateBlastRadius(snapshot: LoadedSnapshot, subsystemIds: Set<string>): number {
  // Use core computeBlastRadius per subsystem; deduplicate transitive dependents.
  const allAffected = new Set<string>()

  for (const subsystemId of subsystemIds) {
    const result = computeBlastRadius(snapshot, subsystemId)
    for (const id of result.direct) allAffected.add(id)
    for (const id of result.transitive) allAffected.add(id)
  }

  return allAffected.size
}

const REQUIRED_CONTEXT_LIMIT = 12

/**
 * Choose files that are likely relevant for editing the explicit `targetPaths`.
 *
 * Priority order (cumulative, dedup'd, capped at REQUIRED_CONTEXT_LIMIT):
 *   1. The target paths themselves (agent sees them in context).
 *   2. Files DIRECTLY imported by any target (1-hop outgoing `imports` edge).
 *   3. Files that DIRECTLY import any target (1-hop incoming `imports` edge).
 *   4. Pad with subsystem-level "critical files" (legacy behavior) if budget left.
 *
 * Pre-fix this function used (4) ONLY — it dumped every subsystem file
 * regardless of which paths the user actually planned to edit. Dogfooding
 * Task 1 + Task 2 both observed the same 12 unrelated cli/* files in
 * requiredContext regardless of refactor scope. Narrowing to AST-adjacent
 * files cuts irrelevant context-budget spend dramatically.
 */
function collectCriticalFiles(
  snapshot: LoadedSnapshot,
  subsystemIds: Set<string>,
  targetPaths: string[],
): string[] {
  const out: string[] = []
  const seen = new Set<string>()

  const push = (path: string): boolean => {
    if (seen.has(path)) return false
    seen.add(path)
    out.push(path)
    return out.length >= REQUIRED_CONTEXT_LIMIT
  }

  // 1. Target paths themselves
  for (const p of targetPaths) {
    if (push(p)) return out
  }

  const targetFileIds = new Set(targetPaths.map((p) => `file:${p}`))

  // 2. Files DIRECTLY imported by any target
  for (const targetId of targetFileIds) {
    const outgoing = snapshot.edgesByNodeId.get(targetId) ?? []
    for (const e of outgoing) {
      if (e.kind !== 'imports') continue
      if (!e.to.startsWith('file:')) continue
      if (push(e.to.replace(/^file:/, ''))) return out
    }
  }

  // 3. Files that DIRECTLY import any target
  for (const targetId of targetFileIds) {
    const incoming = snapshot.edgesByTargetId.get(targetId) ?? []
    for (const e of incoming) {
      if (e.kind !== 'imports') continue
      if (!e.from.startsWith('file:')) continue
      if (push(e.from.replace(/^file:/, ''))) return out
    }
  }

  // 4. Pad with subsystem-level critical files
  for (const nodeId of subsystemIds) {
    const remaining = REQUIRED_CONTEXT_LIMIT - out.length
    if (remaining <= 0) break
    const files = pickCriticalFiles(snapshot, nodeId, { maxFiles: remaining })
    for (const f of files) {
      if (push(f.path)) return out
    }
  }

  return out
}
