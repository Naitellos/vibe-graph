/**
 * scan() — Vibe Graph v0 pipeline orchestrator.
 *
 * Stages:
 *   0  resolve & load  (project root, config, ignore, files, programs)
 *   1  source analyzers — core/files, core/packages, core/ts-imports (parallel)
 *   1.5 yaml-edges analyzer — emits depends_on edges from SubsystemDocs
 *   1.6 tables analyzer — emits table nodes and owns edges from SubsystemDocs
 *   2  semantic analyzers — core/subsystems (sequential after Stage 1)
 *   2b semantic collapse — collapseImportsToSubsystemDependsOn (derived edges)
 *   3  merge — mergeAnalyzerOutputs → {nodes, edges, evidence}
 *   4  detectors — core/cycles, core/fan-out, core/fan-in, core/orphans (parallel)
 *   4.6 rules engine — evaluateRules({ snapshot+findings, baseline, rules })
 *   5  assemble & validate — SnapshotSchema.parse(snapshot)
 *
 * Returns: validated Snapshot. Does NOT write to disk (CLI/MCP layer handles that).
 */

import { randomUUID } from 'node:crypto'
import { readFile } from 'node:fs/promises'
import { basename, join } from 'node:path'
import { pino } from 'pino'
import type { Logger } from 'pino'
import { coreFilesAnalyzer } from '../analyzers/core-files.js'
import { corePackagesAnalyzer } from '../analyzers/core-packages.js'
import { coreSubsystemsAnalyzer } from '../analyzers/core-subsystems.js'
import { coreTablesAnalyzer } from '../analyzers/core-tables.js'
import { coreTsImportsAnalyzer } from '../analyzers/core-ts-imports.js'
import { coreYamlEdgesAnalyzer } from '../analyzers/core-yaml-edges.js'
import { discoverFiles } from '../analyzers/file-discovery.js'
import { createIgnoreMatcher } from '../analyzers/ignore-matcher.js'
import { createProgramManager } from '../analyzers/program-manager.js'
import { collapseImportsToSubsystemDependsOn } from '../analyzers/semantic-collapse.js'
import type { AnalyzerContext } from '../analyzers/types.js'
import { loadConfig } from '../config/config-yml.js'
import { resolveProjectRoot } from '../config/project-root.js'
import { readVibegraphignorePatterns } from '../config/vibegraphignore.js'
import { coreCyclesDetector } from '../detectors/core-cycles.js'
import { coreDriftDetector } from '../detectors/core-drift.js'
import { coreFanInDetector } from '../detectors/core-fan-in.js'
import { coreFanOutDetector } from '../detectors/core-fan-out.js'
import { coreOrphansDetector } from '../detectors/core-orphans.js'
import { loadGraphBaseline } from '../helpers/graph-baseline-store.js'
import { evaluateRules } from '../rules/engine.js'
import type { Finding } from '../schema/finding.js'
import { SnapshotSchema } from '../schema/snapshot.js'
import type { Snapshot } from '../schema/snapshot.js'
import { buildLoadedSnapshot } from '../snapshot/load-snapshot.js'
import { type AnalyzerOutput, mergeAnalyzerOutputs } from './merge.js'

// ─── Public API ───────────────────────────────────────────────────────────────

export interface ScanOptions {
  /** Explicit project root (else resolves via cascade). */
  root?: string
  /** CWD for the cascade (default: process.cwd()). */
  cwd?: string
  /** Optional logger; defaults to silent. */
  log?: Logger
}

// Re-export ScanError from merge so callers can import from a single place.
export { ScanError } from './merge.js'

// ─── Implementation ───────────────────────────────────────────────────────────

interface PackageJson {
  name?: string
}

async function readRootPackageName(projectRoot: string): Promise<string | undefined> {
  try {
    const raw = await readFile(join(projectRoot, 'package.json'), 'utf-8')
    const pkg = JSON.parse(raw) as PackageJson
    return typeof pkg.name === 'string' && pkg.name.length > 0 ? pkg.name : undefined
  } catch {
    return undefined
  }
}

export async function scan(opts: ScanOptions = {}): Promise<Snapshot> {
  const startedAt = Date.now()

  // ── Logger ─────────────────────────────────────────────────────────────────
  const log = opts.log ?? pino({ level: 'silent' })

  // ── Stage 0: resolve & load ────────────────────────────────────────────────
  const projectRoot = await resolveProjectRoot({
    explicit: opts.root,
    cwd: opts.cwd ?? process.cwd(),
  })

  const { config, subsystemDocs } = await loadConfig(projectRoot)

  const ignore = createIgnoreMatcher({
    patterns: readVibegraphignorePatterns(projectRoot),
    includeDefaults: true,
  })

  const files = await discoverFiles({ projectRoot, ignore })

  const programs = await createProgramManager({ projectRoot, files })

  // ── Analyzer context ───────────────────────────────────────────────────────
  const ctx: AnalyzerContext = {
    projectRoot,
    programs,
    files,
    ignore,
    log,
    config,
    subsystemDocs,
  }

  // ── Stage 1: source analyzers (parallel) ───────────────────────────────────
  const [filesResult, packagesResult, tsImportsResult] = await Promise.all([
    coreFilesAnalyzer.run(ctx),
    corePackagesAnalyzer.run(ctx),
    coreTsImportsAnalyzer.run(ctx),
  ])

  const stage1Outputs: AnalyzerOutput[] = [
    { analyzerId: coreFilesAnalyzer.id, ...filesResult },
    { analyzerId: corePackagesAnalyzer.id, ...packagesResult },
    { analyzerId: coreTsImportsAnalyzer.id, ...tsImportsResult },
  ]

  // ── Stage 1.5 & 1.6: yaml-edges and tables analyzers ────────────────────────
  const yamlEdgesResult = await coreYamlEdgesAnalyzer.run(ctx)
  const tablesResult = await coreTablesAnalyzer.run(ctx)

  const stage1_5_1_6_Outputs: AnalyzerOutput[] = [
    { analyzerId: coreYamlEdgesAnalyzer.id, ...yamlEdgesResult },
    { analyzerId: coreTablesAnalyzer.id, ...tablesResult },
  ]

  // ── Stage 2: semantic analyzers ────────────────────────────────────────────
  const subsystemsResult = await coreSubsystemsAnalyzer.run(ctx)
  const subsystemsOutput: AnalyzerOutput = {
    analyzerId: coreSubsystemsAnalyzer.id,
    ...subsystemsResult,
  }

  // ── Stage 2b: semantic collapse ────────────────────────────────────────────
  // Collect all nodes and edges emitted so far to feed into the collapse.
  const allNodesForCollapse = [
    ...filesResult.nodes,
    ...packagesResult.nodes,
    ...tsImportsResult.nodes,
    ...yamlEdgesResult.nodes,
    ...tablesResult.nodes,
    ...subsystemsResult.nodes,
  ]
  const allEdgesForCollapse = [
    ...filesResult.edges,
    ...packagesResult.edges,
    ...tsImportsResult.edges,
    ...yamlEdgesResult.edges,
    ...tablesResult.edges,
    ...subsystemsResult.edges,
  ]

  // Match globs for the collapse fallback: prefer curated docs, else fall back
  // to inline config.subsystems[] (which also carry match globs). Mirrors
  // core-subsystems' docs-shadow-inline precedence so both modes get the fallback.
  const matchSubsystems =
    subsystemDocs.length > 0
      ? subsystemDocs.map((d) => ({ id: d.id, match: d.match }))
      : config.subsystems.map((s) => ({ id: s.id, match: s.match }))

  const collapseResult = collapseImportsToSubsystemDependsOn({
    nodes: allNodesForCollapse,
    edges: allEdgesForCollapse,
    subsystems: matchSubsystems,
  })

  const collapseOutput: AnalyzerOutput = {
    analyzerId: 'core/subsystems-collapse',
    nodes: [],
    edges: collapseResult.edges,
    evidence: [],
  }

  // ── Stage 3: merge ─────────────────────────────────────────────────────────
  const allOutputs: AnalyzerOutput[] = [
    ...stage1Outputs,
    ...stage1_5_1_6_Outputs,
    subsystemsOutput,
    collapseOutput,
  ]

  const { nodes, edges, evidence } = mergeAnalyzerOutputs(allOutputs)

  // ── Stage 4: detectors (parallel) ──────────────────────────────────────────
  // Build a tentative snapshot meta for the LoadedSnapshot. We compute the
  // final scanDurationMs after detectors complete, but detectors only need
  // the merged graph (nodes/edges/findings=[]) to run.
  const tentativeMeta = {
    schemaVersion: '0.1.0' as const,
    scanId: randomUUID(),
    builtAt: new Date().toISOString(),
    projectRoot,
    projectName: 'pending',
    vibegraphVersion: '0.0.0',
    scanDurationMs: 0,
    fileCounts: { scanned: files.length, indexed: files.length, skipped: 0 },
  }
  const tentativeSnap = SnapshotSchema.parse({
    meta: tentativeMeta,
    nodes,
    edges,
    evidence,
    findings: [],
  })
  const loaded = buildLoadedSnapshot(tentativeSnap)
  const detectorCtx = { snapshot: loaded, log }

  // Drift compares curated SubsystemDoc declarations against AST-observed edges.
  // It is meaningful only for curated projects: in auto-detect / inline-config
  // modes (no SubsystemDoc YAMLs) there is nothing to drift-check, so every
  // cross-package import would surface as noise. Skip it there — matching the
  // cockpit's "drift works only with curated YAML" banner (spec §9, State A/B).
  const detectors = [
    coreCyclesDetector,
    coreDriftDetector,
    coreFanOutDetector,
    coreFanInDetector,
    coreOrphansDetector,
  ]
  const activeDetectors =
    subsystemDocs.length > 0 ? detectors : detectors.filter((d) => d.id !== coreDriftDetector.id)

  const detectorResults = await Promise.all(activeDetectors.map((d) => d.run(detectorCtx)))
  const findings: Finding[] = detectorResults.flat()

  // ── Stage 4.6: rules engine ────────────────────────────────────────────────
  // Rebuild LoadedSnapshot with detector findings so rules that read findings
  // (drift-must-not-worsen) can see them. Then load the baseline (null on first
  // scan — most rules become no-ops) and run evaluateRules with the merged
  // user+default rule set.
  const tentativeSnapWithFindings = SnapshotSchema.parse({
    meta: tentativeMeta,
    nodes,
    edges,
    evidence,
    findings,
  })
  const loadedWithFindings = buildLoadedSnapshot(tentativeSnapWithFindings)

  const baseline = await loadGraphBaseline(projectRoot)
  const ruleFindings = evaluateRules({
    snapshot: loadedWithFindings,
    baseline,
    rules: config.rules,
  })
  findings.push(...ruleFindings)

  // ── Stage 5: assemble & validate ───────────────────────────────────────────
  const pkgName = config.project.name ?? (await readRootPackageName(projectRoot))
  const projectName = pkgName ?? basename(projectRoot)

  const meta = {
    ...tentativeMeta,
    projectName,
    scanDurationMs: Date.now() - startedAt,
  }

  const raw = { meta, nodes, edges, evidence, findings }

  // Validate via schema — throws ZodError on analyzer output drift (programmer error).
  return SnapshotSchema.parse(raw)
}
