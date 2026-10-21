/**
 * Workspace package → source resolution.
 *
 * In a workspace monorepo, a bare import like `import … from '@scope/pkg'`
 * resolves (via the node_modules symlink + the package's `exports`/`types`) to
 * the *built* `dist/*.d.ts`, not to `src`. Since `dist/` is excluded from
 * indexing, the import target is owned by no subsystem and downstream steps
 * (semantic-collapse, drift) lose the cross-package dependency.
 *
 * Fix: synthesize TS `paths` entries that point each workspace package's name
 * at its in-repo source entry, so the scanner's Program resolves cross-package
 * imports to source files it actually indexes.
 */

import { existsSync } from 'node:fs'
import { readFile } from 'node:fs/promises'
import { join } from 'node:path'
import { parse as parseYaml } from 'yaml'
import { globWorkspaceDirs } from './workspace-dirs.js'

/** Candidate source-entry filenames, relative to a package's `src/` dir, in priority order. */
const ENTRY_CANDIDATES = [
  'index.ts',
  'index.tsx',
  'index.mts',
  'index.cts',
  'index.js',
  'index.jsx',
]

export interface WorkspacePackage {
  /** Declared package name, e.g. `@scope/pkg`. */
  name: string
  /** Absolute source-entry files that exist (first = highest priority). */
  entryFilesAbs: string[]
  /** Absolute path to the package's source dir (for `name/*` subpath mapping). */
  srcDirAbs: string
}

interface PackageJson {
  name?: string
  workspaces?: string[] | { packages?: string[] }
}

interface PnpmWorkspaceYaml {
  packages?: string[]
}

async function readJson(filePath: string): Promise<PackageJson | null> {
  try {
    return JSON.parse(await readFile(filePath, 'utf8')) as PackageJson
  } catch {
    return null
  }
}

/** Detect workspace package globs from pnpm-workspace.yaml or package.json `workspaces`. */
async function detectWorkspaceGlobs(projectRoot: string): Promise<string[] | null> {
  try {
    const pnpmYaml = await readFile(join(projectRoot, 'pnpm-workspace.yaml'), 'utf8')
    const parsed = parseYaml(pnpmYaml) as PnpmWorkspaceYaml
    if (Array.isArray(parsed?.packages) && parsed.packages.length > 0) return parsed.packages
  } catch {
    // no pnpm-workspace.yaml — fall through to package.json workspaces
  }

  const rootPkg = await readJson(join(projectRoot, 'package.json'))
  const ws = rootPkg?.workspaces
  if (Array.isArray(ws)) return ws
  if (ws && typeof ws === 'object' && Array.isArray(ws.packages)) return ws.packages
  return null
}

/**
 * Enumerate workspace packages with a discoverable `src/` entry. Returns [] when
 * the project is not a workspace (single-package repos resolve fine already).
 */
export async function detectWorkspacePackages(projectRoot: string): Promise<WorkspacePackage[]> {
  const globs = await detectWorkspaceGlobs(projectRoot)
  if (globs === null || globs.length === 0) return []

  const dirs = await globWorkspaceDirs(projectRoot, globs)
  const pkgs: WorkspacePackage[] = []

  for (const dir of dirs) {
    const pkg = await readJson(join(dir, 'package.json'))
    const name = pkg?.name
    if (typeof name !== 'string' || name.length === 0) continue

    const srcDirAbs = join(dir, 'src')
    if (!existsSync(srcDirAbs)) continue

    const entryFilesAbs = ENTRY_CANDIDATES.map((f) => join(srcDirAbs, f)).filter((p) =>
      existsSync(p),
    )
    if (entryFilesAbs.length === 0) continue

    pkgs.push({ name, entryFilesAbs, srcDirAbs })
  }

  return pkgs
}
