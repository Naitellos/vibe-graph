import type { Logger } from 'pino'
import type { VibegraphConfig } from '../config/config-yml.js'
import type { Edge } from '../schema/edge.js'
import type { Evidence } from '../schema/evidence.js'
import type { Node } from '../schema/node.js'
import type { SubsystemDoc } from '../schema/subsystem-doc.js'
import type { IgnoreMatcher } from './ignore-matcher.js'
import type { ProgramManager } from './program-manager.js'

export interface AnalyzerContext {
  /** Absolute, realpath-normalized project root. */
  projectRoot: string
  /** Shared ProgramManager. Never raw ts.Program. */
  programs: ProgramManager
  /** Absolute paths of every in-scope source file. */
  files: readonly string[]
  /** IgnoreMatcher to consult when an analyzer wants to filter further. */
  ignore: IgnoreMatcher
  /** Structured logger; analyzers log under `{ analyzerId, scanId }`. */
  log: Logger
  /** Project config loaded from .vibegraph/config.yml (or defaults). */
  config: VibegraphConfig
  /** Subsystem documentation loaded from .vibegraph/subsystems/. */
  subsystemDocs: SubsystemDoc[]
}

export interface AnalyzerResult {
  nodes: Node[]
  edges: Edge[]
  evidence: Evidence[]
}

export interface Analyzer {
  /** Unique, namespaced id. e.g. `core/ts-imports`, `plugin-x/routes`. */
  readonly id: string
  /** Short human description for logs and doctor. */
  readonly description: string
  run(ctx: AnalyzerContext): Promise<AnalyzerResult>
}
