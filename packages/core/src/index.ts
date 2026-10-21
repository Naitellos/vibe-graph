export const CORE_PACKAGE_NAME = '@codearch/core' as const

// errors
export { TaskError } from './errors/task-error.js'
export type { TaskErrorCode } from './errors/task-error.js'

export * from './schema/index.js'
export { SubsystemDocSchema, type SubsystemDoc } from './schema/subsystem-doc.js'
export * from './graph/edge-categories.js'

// pipeline
export { scan, type ScanOptions } from './scan/scan.js'

// scan errors (Stage 3 merge)
export {
  ScanError,
  type ScanErrorCode,
  type AnalyzerOutput,
  type MergeResult,
  mergeAnalyzerOutputs,
} from './scan/merge.js'

// helpers
export {
  computeBlastRadius,
  type BlastRadiusOptions,
  type BlastRadiusResult,
} from './helpers/blast-radius.js'
export {
  resolveTarget,
  type ResolveTargetResult,
  type TargetResolutionError,
  type TargetResolutionErrorCode,
} from './helpers/resolve-target.js'
export { buildContextPack, type BuildContextPackInput } from './helpers/context-pack-builder.js'
export {
  redactSecrets,
  type RedactResult,
  type RedactOptions,
  type SecretKind,
} from './helpers/redact-secrets.js'
export { estimateTokens } from './helpers/estimate-tokens.js'
export {
  pickCriticalFiles,
  type PickCriticalFilesOptions,
  type CriticalFile,
  type FileRole,
  inferRole,
} from './helpers/pick-critical-files.js'
export {
  loadBaseline,
  writeBaselineEntry,
  type BaselineStore,
  type WriteEntryInput,
} from './helpers/baseline-store.js'
export {
  loadGraphBaseline,
  writeGraphBaseline,
} from './helpers/graph-baseline-store.js'
export {
  generateTaskId,
  loadTaskSession,
  writeTaskSession,
} from './helpers/task-session-store.js'
export {
  computeAffectedNodeIds,
  computeFindingsDelta,
  computeGraphDelta,
  isFindingInScope,
  isFindingWorse,
  type FindingsDelta,
  type GraphDelta,
} from './helpers/delta.js'
export { parseGitNameStatus, runGitDiff } from './helpers/git-diff.js'
export { collectNewCoupling, buildConformance } from './helpers/conformance.js'

// snapshot machinery
export {
  createSnapshotReader,
  SnapshotReaderError,
  type SnapshotReader,
  type SnapshotReaderOptions,
  type SnapshotReaderErrorCode,
} from './snapshot/snapshot-reader.js'
export { writeSnapshotAtomic } from './snapshot/atomic-writer.js'
export { buildLoadedSnapshot, type LoadedSnapshot } from './snapshot/load-snapshot.js'

// semantic collapse (used by scan, but also exported for advanced callers)
export {
  collapseImportsToSubsystemDependsOn,
  type SemanticCollapseInput,
  type SemanticCollapseResult,
} from './analyzers/semantic-collapse.js'

// config (callers may want to load config independently)
export {
  loadConfig,
  ConfigSchema,
  DEFAULT_CONFIG,
  type VibegraphConfig,
  type LoadedConfig,
} from './config/config-yml.js'

// subsystems loader
export {
  loadSubsystemDocs,
  LoaderError,
  type LoaderErrorCode,
  type LoadedSubsystems,
} from './config/subsystems-loader.js'

// project root resolution
export { resolveProjectRoot, type ResolveProjectRootOptions } from './config/project-root.js'

// defaults
export { DEFAULT_IGNORE_PATTERNS, DEFAULT_DETECTOR_THRESHOLDS } from './config/defaults.js'

// vibegraphignore reader
export { readVibegraphignorePatterns } from './config/vibegraphignore.js'

// ignore matcher
export {
  createIgnoreMatcher,
  type IgnoreMatcher,
  type CreateIgnoreMatcherOptions,
} from './analyzers/ignore-matcher.js'

// file discovery
export { discoverFiles, type DiscoverFilesOptions } from './analyzers/file-discovery.js'

// analyzer/detector interfaces
export type { Analyzer, AnalyzerContext, AnalyzerResult } from './analyzers/types.js'
export type { Detector, DetectorContext } from './detectors/types.js'

// analyzers (individual instances — callers can run them directly or compose pipelines)
export { coreFilesAnalyzer } from './analyzers/core-files.js'
export { corePackagesAnalyzer } from './analyzers/core-packages.js'
export { coreTsImportsAnalyzer } from './analyzers/core-ts-imports.js'
export { coreSubsystemsAnalyzer } from './analyzers/core-subsystems.js'
export { coreYamlEdgesAnalyzer } from './analyzers/core-yaml-edges.js'
export { coreTablesAnalyzer } from './analyzers/core-tables.js'

// detectors
export { coreCyclesDetector } from './detectors/core-cycles.js'
export { coreFanOutDetector } from './detectors/core-fan-out.js'
export { coreFanInDetector } from './detectors/core-fan-in.js'
export { coreOrphansDetector } from './detectors/core-orphans.js'
export { coreDriftDetector } from './detectors/core-drift.js'

// program manager (advanced: callers building custom analyzers)
export {
  createProgramManager,
  type ProgramManager,
  type CreateProgramManagerOptions,
} from './analyzers/program-manager.js'

// rules engine
export {
  evaluateRules,
  type EvaluateRulesContext,
  type RuleEvaluatorContext,
} from './rules/engine.js'
export { collectInertRuleWarnings, type InertRuleWarning } from './rules/inert-rules.js'
export { DEFAULT_BUILTIN_RULES } from './rules/builtin/index.js'

// diff parsing
export { parseDiffText, type DiffParseResult } from './diff/parser.js'
export {
  buildWorkingGraph,
  type BuildWorkingGraphOptions,
  type WorkingGraph,
} from './diff/working-graph.js'

// validate-diff orchestration (shared by MCP tool + CLI HTTP route)
export { validateDiff, type ValidateDiffDeps } from './diff/validate-diff.js'

// validate-diff UI payload transformer (used by CLI HTTP route)
export {
  toValidateDiffUiPayload,
  type ValidateDiffUiPayload,
  ValidateDiffUiPayloadSchema,
} from './schema/validate-diff-ui-payload.js'

// task prepare-task helpers
export {
  formatRuleAsDoNotDo,
  humanizeBuiltinTitle,
  isForbiddingRule,
  isRuleApplicableToSubsystems,
} from './tasks/prepare-task-rules.js'

// task prepare-task (core logic)
export { prepareTask } from './tasks/prepare-task.js'
export type { LoadConfigFn, PrepareTaskContext } from './tasks/prepare-task.js'

// overview
export { buildOverview, type ProjectOverview } from './overview/build-overview.js'
