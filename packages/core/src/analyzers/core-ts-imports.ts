import { relative } from 'node:path'
import type { Logger } from 'pino'
import ts = require('typescript')
import type { EvidenceCoupling } from '../schema/common.js'
import type { Edge } from '../schema/edge.js'
import type { Evidence } from '../schema/evidence.js'
import type { Analyzer, AnalyzerContext, AnalyzerResult } from './types.js'

/** Determine the coupling kind for an ImportDeclaration. */
function classifyImport(stmt: ts.ImportDeclaration): EvidenceCoupling {
  const clause = stmt.importClause

  // Side-effect import: `import './a'` — no importClause
  if (clause === undefined) return 'runtime'

  // Entire import is type-only: `import type { X } from './a'`
  if (clause.isTypeOnly) return 'type-only'

  // Default import present (e.g. `import Foo from './a'`) — runtime
  if (clause.name !== undefined) return 'runtime'

  // Named bindings only
  const bindings = clause.namedBindings
  if (bindings === undefined) return 'runtime'

  // Namespace import `import * as ns from './a'` — runtime (no per-element modifier)
  if (ts.isNamespaceImport(bindings)) return 'runtime'

  // NamedImports: every element must have `isTypeOnly` for the whole import to be type-only
  if (ts.isNamedImports(bindings)) {
    const hasValueBinding = bindings.elements.some((el) => !el.isTypeOnly)
    return hasValueBinding ? 'runtime' : 'type-only'
  }

  return 'runtime'
}

/** Determine the coupling kind for an ExportDeclaration with a module specifier. */
function classifyExport(stmt: ts.ExportDeclaration): EvidenceCoupling {
  return stmt.isTypeOnly ? 'type-only' : 'runtime'
}

/** Map a coupling value to the appropriate weight fields. */
function couplingToWeights(coupling: EvidenceCoupling): {
  runtimeWeight: number
  typeOnlyWeight: number
  dynamicWeight: number
} {
  switch (coupling) {
    case 'type-only':
      return { runtimeWeight: 0, typeOnlyWeight: 1, dynamicWeight: 0 }
    case 'dynamic':
      return { runtimeWeight: 0, typeOnlyWeight: 0, dynamicWeight: 1 }
    default:
      // 'runtime' and 'reexport'
      return { runtimeWeight: 1, typeOnlyWeight: 0, dynamicWeight: 0 }
  }
}

export const coreTsImportsAnalyzer: Analyzer = {
  id: 'core/ts-imports',
  description: 'emits Edge{kind:imports} per TS/JS import or re-export',

  async run(ctx: AnalyzerContext): Promise<AnalyzerResult> {
    const edges: Edge[] = []
    const evidence: Evidence[] = []

    // Files we were asked to analyze but which the Program has no SourceFile for.
    // Every such file contributes zero edges, silently. Three separate bugs have
    // now presented this way — a full file count with a near-empty edge set and a
    // scan that reports success — so the miss rate is tracked and surfaced below
    // rather than being swallowed one `continue` at a time.
    let missing = 0

    for (const absPath of ctx.files) {
      const program = ctx.programs.getProgramForFile(absPath)
      const sourceFile = program.getSourceFile(absPath)
      if (sourceFile === undefined) {
        missing++
        continue
      }

      const compilerOptions = program.getCompilerOptions()
      const relPath = relative(ctx.projectRoot, absPath).replaceAll('\\', '/')
      // sourceFile is non-null here (we already checked and continued above)
      const sf = sourceFile

      /** Emit one edge + one evidence for a single import/require/dynamic reference. */
      function emitEdge(specifierText: string, coupling: EvidenceCoupling, pos: number) {
        const resolved = ts.resolveModuleName(specifierText, absPath, compilerOptions, ts.sys)

        const resolvedFileName = resolved.resolvedModule?.resolvedFileName
        const isExternal =
          resolvedFileName === undefined || resolvedFileName.includes('node_modules')

        let toNodeId: string
        if (!isExternal && resolvedFileName !== undefined) {
          const targetRel = relative(ctx.projectRoot, resolvedFileName).replaceAll('\\', '/')
          toNodeId = `file:${targetRel}`
        } else {
          toNodeId = `external:${specifierText}`
        }

        const { line, character } = sf.getLineAndCharacterOfPosition(pos)
        const line1 = line + 1
        const col1 = character + 1

        const evId = `ev:${relPath}:${line1}:${col1}`
        const fromNodeId = `file:${relPath}`
        const edgeId = `${fromNodeId}->${toNodeId}:imports`

        const ev: Evidence = {
          id: evId,
          sourceKind: 'ast',
          file: relPath,
          line: line1,
          column: col1,
          symbol: specifierText,
          detail: `import '${specifierText}'`,
          confidence: 'high',
          coupling,
        }

        const weights = couplingToWeights(coupling)
        const edge: Edge = {
          id: edgeId,
          from: fromNodeId,
          to: toNodeId,
          kind: 'imports',
          category: 'structural',
          source: 'ast',
          confidence: 'high',
          evidenceIds: [evId],
          weight: 1,
          ...weights,
          metadata: {},
        }

        evidence.push(ev)
        edges.push(edge)
      }

      // -----------------------------------------------------------------------
      // 1. Walk top-level statements for ImportDeclaration / ExportDeclaration
      // -----------------------------------------------------------------------
      for (const stmt of sf.statements) {
        if (ts.isImportDeclaration(stmt)) {
          const moduleSpecifier = stmt.moduleSpecifier as ts.StringLiteral
          const coupling = classifyImport(stmt)
          const pos = stmt.getStart(sf)
          emitEdge(moduleSpecifier.text, coupling, pos)
        } else if (ts.isExportDeclaration(stmt) && stmt.moduleSpecifier !== undefined) {
          const moduleSpecifier = stmt.moduleSpecifier as ts.StringLiteral
          const coupling = classifyExport(stmt)
          const pos = stmt.getStart(sf)
          emitEdge(moduleSpecifier.text, coupling, pos)
        }
      }

      // -----------------------------------------------------------------------
      // 2. Recursive AST walk to find dynamic import() and require() expressions
      // -----------------------------------------------------------------------
      function walkForExpressions(node: ts.Node) {
        if (ts.isCallExpression(node)) {
          const expr = node.expression
          const args = node.arguments

          // Dynamic import: import('./foo')
          if (expr.kind === ts.SyntaxKind.ImportKeyword) {
            const firstArg = args[0]
            if (args.length >= 1 && firstArg !== undefined && ts.isStringLiteral(firstArg)) {
              emitEdge(firstArg.text, 'dynamic', node.getStart(sf))
            }
            // Don't recurse into the arguments of import() itself — specifier is terminal
            return
          }

          // require('./foo') — Identifier named "require" with a string literal arg
          const firstArg = args[0]
          if (
            ts.isIdentifier(expr) &&
            (expr as ts.Identifier).escapedText === 'require' &&
            args.length >= 1 &&
            firstArg !== undefined &&
            ts.isStringLiteral(firstArg)
          ) {
            emitEdge(firstArg.text, 'runtime', node.getStart(sf))
            return
          }
        }

        ts.forEachChild(node, walkForExpressions)
      }

      // Walk everything EXCEPT top-level ImportDeclaration / ExportDeclaration
      // which were already handled above, to avoid double-counting.
      for (const stmt of sf.statements) {
        if (ts.isImportDeclaration(stmt) || ts.isExportDeclaration(stmt)) continue
        walkForExpressions(stmt)
      }
    }

    reportProgramCoverage(ctx.log, ctx.files.length, missing)

    return { nodes: [], edges, evidence }
  },
}

/** Below this share of files present in the Program, the graph is not trustworthy. */
export const MIN_PROGRAM_COVERAGE = 0.9

/**
 * Warn loudly when most discovered files never made it into the ts.Program.
 *
 * This is the product holding itself to its own standard. Three distinct bugs
 * shipped undetected because a degenerate graph is indistinguishable from a clean
 * one at a glance: `projectReferences` redirecting files to absent build outputs,
 * a tsconfig resolving to empty `compilerOptions`, and `rootNames` seeded from the
 * root config's build set. In every case the scan reported success, `doctor` called
 * the graph valid, and the Overview presented phantom "orphan subsystem — consider
 * whether it's dead code" items as the project's top risks.
 *
 * A confidently wrong answer is the most expensive failure mode an evidence-based
 * tool has, so a collapsed graph must announce itself.
 */
export function reportProgramCoverage(log: Logger, total: number, missing: number): void {
  if (total === 0 || missing === 0) return
  const covered = total - missing
  const coverage = covered / total
  if (coverage >= MIN_PROGRAM_COVERAGE) {
    log.debug({ total, missing, coverage }, 'ts-imports: some files absent from the Program')
    return
  }
  log.warn(
    { total, missing, covered, coverage: Number(coverage.toFixed(3)) },
    `vibe-graph: only ${covered} of ${total} source files (${(coverage * 100).toFixed(1)}%) reached the TypeScript Program, so most import edges are MISSING and any architecture finding below is unreliable. This is usually the root tsconfig — a solution-style config, an unresolvable \`extends\`, or an \`include\` that covers only tooling. Point --root at an individual package to confirm.`,
  )
}
