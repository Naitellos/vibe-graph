import ts = require('typescript')
import { type WorkspacePackage, detectWorkspacePackages } from './workspace-paths.js'

export interface ProgramManager {
  getProgramForFile(absPath: string): ts.Program
  getAllPrograms(): readonly ts.Program[]
}

export interface CreateProgramManagerOptions {
  projectRoot: string
  files: readonly string[]
}

/** Does a TS `paths` key (exact or single-`*` wildcard) match a specifier? */
function pathKeyMatches(key: string, specifier: string): boolean {
  const star = key.indexOf('*')
  if (star === -1) return key === specifier
  const prefix = key.slice(0, star)
  const suffix = key.slice(star + 1)
  return (
    specifier.length >= prefix.length + suffix.length &&
    specifier.startsWith(prefix) &&
    specifier.endsWith(suffix)
  )
}

/** Is `specifier` already covered by any user-declared `paths` key? */
function userPathsCover(specifier: string, userPaths: Record<string, string[]>): boolean {
  return Object.keys(userPaths).some((key) => pathKeyMatches(key, specifier))
}

/**
 * Merge synthesized workspace `paths` into compiler options so cross-package
 * imports resolve to source instead of built `dist/*.d.ts`.
 *
 * Two correctness constraints:
 *  - **No `baseUrl`.** Introducing one would enable baseUrl-relative resolution
 *    of bare specifiers (e.g. `import 'react'` → `<root>/react.ts`). We use
 *    absolute `paths` values instead, which resolve without a baseUrl.
 *  - **Respect user `paths`.** A synthesized exact key (`@scope/pkg`) would
 *    otherwise out-prioritize a user wildcard (`@scope/*`). We skip any key
 *    already covered by a user pattern, so configured monorepos are unchanged.
 */
export function applyWorkspacePaths(
  options: ts.CompilerOptions,
  projectRoot: string,
  pkgs: readonly WorkspacePackage[],
): ts.CompilerOptions {
  if (pkgs.length === 0) return options

  const userPaths = options.paths ?? {}
  const synthesized: Record<string, string[]> = {}

  for (const pkg of pkgs) {
    if (!userPathsCover(pkg.name, userPaths)) {
      synthesized[pkg.name] = [...pkg.entryFilesAbs]
    }
    // Probe a representative subpath to see whether a user wildcard already
    // covers `${name}/*` (an exact user key for the bare name does not).
    if (!userPathsCover(`${pkg.name}/_`, userPaths)) {
      synthesized[`${pkg.name}/*`] = [`${pkg.srcDirAbs}/*`]
    }
  }

  if (Object.keys(synthesized).length === 0) return options

  return {
    ...options,
    // User paths win on exact-key collision; synthesized keys are skipped above
    // when a user pattern already covers them.
    paths: { ...synthesized, ...userPaths },
  }
}

/**
 * Guarantee the compiler can actually resolve module specifiers.
 *
 * Two very common tsconfig shapes resolve to an option set with no
 * `moduleResolution`, and TypeScript then resolves almost nothing:
 *
 *  - a **solution-style** root config (`{"files": [], "references": [...]}`)
 *    carries no `compilerOptions` of its own — hono, date-fns and payload all
 *    ship one;
 *  - an **`extends` that cannot be resolved**, e.g. `extends:
 *    "@sindresorhus/tsconfig"` before `npm install` has run.
 *
 * The failure is silent, which is the dangerous part: the scan reports success,
 * `doctor` calls the graph valid, and the Overview presents phantom "orphan
 * subsystem" items as top risks. Measured on hono at the same commit — 61 import
 * edges with the config as shipped, 1008 once resolution works.
 *
 * `Bundler` is the permissive choice on purpose: it resolves extensionless
 * relative specifiers (`from '../../hono'`) as well as explicit `.js` ones, so it
 * recovers the most edges across unknown repos. Anything the config *did* set is
 * preserved untouched — this only fills a vacuum, it never overrides.
 */
export function ensureUsableModuleResolution(options: ts.CompilerOptions): ts.CompilerOptions {
  if (options.moduleResolution !== undefined) return options
  return {
    ...options,
    module: options.module ?? ts.ModuleKind.ESNext,
    moduleResolution: ts.ModuleResolutionKind.Bundler,
    target: options.target ?? ts.ScriptTarget.ES2022,
    allowJs: options.allowJs ?? true,
    esModuleInterop: options.esModuleInterop ?? true,
  }
}

/**
 * v0: single shared ts.Program (SingleProgramManager) wrapping either:
 *   - the tsconfig.json found at projectRoot, or
 *   - a synthetic config with allowJs=true for vanilla JS projects.
 *
 * Future v1: MultiProgramManager (one Program per tsconfig). The interface
 * is shaped so analyzers don't need to change — they always go through
 * `getProgramForFile(abs)`.
 */
export async function createProgramManager(
  opts: CreateProgramManagerOptions,
): Promise<ProgramManager> {
  const configPath = ts.findConfigFile(opts.projectRoot, ts.sys.fileExists, 'tsconfig.json')
  const workspacePkgs = await detectWorkspacePackages(opts.projectRoot)

  let program: ts.Program
  if (configPath) {
    const parsed = ts.getParsedCommandLineOfConfigFile(
      configPath,
      {},
      {
        ...ts.sys,
        onUnRecoverableConfigFileDiagnostic: () => undefined,
      },
    )
    if (!parsed) throw new Error(`failed to parse tsconfig at ${configPath}`)
    program = ts.createProgram({
      // The discovered file set is authoritative, and the tsconfig's own file list
      // is only additive. `core-ts-imports` iterates `ctx.files` and silently skips
      // any file the Program has no SourceFile for, so a Program that is not a
      // SUPERSET of `opts.files` loses edges without any error surfacing.
      //
      // Seeding rootNames from `parsed.fileNames` alone broke exactly that, because
      // a root tsconfig describes what the repo BUILDS, not what it contains. An
      // umbrella root config deliberately compiles almost nothing — the real code is
      // owned by per-package configs. Measured: TanStack/query ships
      // `"include": ["*.config.*"]` → 2 of 1109 discovered files in the Program and
      // 3 import edges; payload's root include matches no existing directory → 6 of
      // 7001 files and 15 edges. Both scans reported success.
      //
      // Union rather than plain `opts.files`: the config legitimately lists files
      // discovery does not glob (ambient/generated `.d.ts`), and those are valid
      // resolution targets. They emit no edges of their own, since edges are only
      // emitted for files in `ctx.files`.
      rootNames: [...new Set([...parsed.fileNames, ...opts.files])],
      options: applyWorkspacePaths(
        ensureUsableModuleResolution({ ...parsed.options, noEmit: true, skipLibCheck: true }),
        opts.projectRoot,
        workspacePkgs,
      ),
      // `projectReferences` is deliberately NOT forwarded. It tells TypeScript that
      // files owned by a referenced project live in that project's BUILD OUTPUT, and
      // redirects them there. vibe-graph never builds anything, so those outputs do
      // not exist and the files are silently dropped from the Program — measured on
      // hono: 32 of 360 root files survived, 38 relative imports instead of 945.
      // We only ever read sources, so the references buy nothing and cost the graph.
    })
  } else {
    program = ts.createProgram({
      rootNames: [...opts.files],
      options: applyWorkspacePaths(
        {
          allowJs: true,
          noEmit: true,
          target: ts.ScriptTarget.ES2022,
          module: ts.ModuleKind.NodeNext,
          moduleResolution: ts.ModuleResolutionKind.NodeNext,
          skipLibCheck: true,
          esModuleInterop: true,
        },
        opts.projectRoot,
        workspacePkgs,
      ),
    })
  }

  return {
    getProgramForFile: () => program,
    getAllPrograms: () => [program],
  }
}
