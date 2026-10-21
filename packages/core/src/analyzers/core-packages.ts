import { readFile } from 'node:fs/promises'
import { join } from 'node:path'
import { parse as parseYaml } from 'yaml'
import type { Analyzer, AnalyzerContext, AnalyzerResult } from './types.js'
import { globWorkspaceDirs } from './workspace-dirs.js'

interface PackageJson {
  name?: string
  workspaces?: string[] | { packages: string[] }
  dependencies?: Record<string, string>
  devDependencies?: Record<string, string>
  peerDependencies?: Record<string, string>
  optionalDependencies?: Record<string, string>
}

interface PnpmWorkspaceYaml {
  packages?: string[]
}

async function readJson(filePath: string): Promise<PackageJson | null> {
  try {
    const raw = await readFile(filePath, 'utf8')
    return JSON.parse(raw) as PackageJson
  } catch {
    return null
  }
}

async function readText(filePath: string): Promise<string | null> {
  try {
    return await readFile(filePath, 'utf8')
  } catch {
    return null
  }
}

/** Resolve workspace glob patterns to absolute directories containing a package.json. */
async function resolveWorkspaceDirs(root: string, globs: string[]): Promise<string[]> {
  const matches = await globWorkspaceDirs(root, globs)

  const dirs: string[] = []
  for (const dir of matches) {
    const pkgPath = join(dir, 'package.json')
    const pkg = await readJson(pkgPath)
    if (pkg !== null) {
      dirs.push(dir)
    }
  }
  return dirs
}

/** Extract workspace glob patterns from root package.json and pnpm-workspace.yaml. */
async function detectWorkspaceGlobs(root: string, rootPkg: PackageJson): Promise<string[] | null> {
  // pnpm: check pnpm-workspace.yaml first
  const pnpmYamlPath = join(root, 'pnpm-workspace.yaml')
  const pnpmYamlText = await readText(pnpmYamlPath)
  if (pnpmYamlText !== null) {
    const parsed = parseYaml(pnpmYamlText) as PnpmWorkspaceYaml
    if (Array.isArray(parsed?.packages) && parsed.packages.length > 0) {
      return parsed.packages
    }
  }

  // npm/yarn: check package.json workspaces field
  if (rootPkg.workspaces !== undefined) {
    if (Array.isArray(rootPkg.workspaces)) {
      return rootPkg.workspaces
    }
    if (typeof rootPkg.workspaces === 'object' && Array.isArray(rootPkg.workspaces.packages)) {
      return rootPkg.workspaces.packages
    }
  }

  return null
}

/** Collect all dep names from all dep fields. */
function collectDeps(pkg: PackageJson): string[] {
  const all = [
    ...Object.keys(pkg.dependencies ?? {}),
    ...Object.keys(pkg.devDependencies ?? {}),
    ...Object.keys(pkg.peerDependencies ?? {}),
    ...Object.keys(pkg.optionalDependencies ?? {}),
  ]
  return all
}

export const corePackagesAnalyzer: Analyzer = {
  id: 'core/packages',
  description: 'emits one package Node per workspace + one external Node per npm dep',

  async run(ctx: AnalyzerContext): Promise<AnalyzerResult> {
    const root = ctx.projectRoot

    // 1. Read root package.json — absent → empty result.
    const rootPkgPath = join(root, 'package.json')
    const rootPkg = await readJson(rootPkgPath)
    if (rootPkg === null) {
      return { nodes: [], edges: [], evidence: [] }
    }

    // 2. Detect workspaces.
    const globs = await detectWorkspaceGlobs(root, rootPkg)

    // 3. Resolve workspace directories.
    let workspaceDirs: string[]
    let isMonorepo: boolean

    if (globs !== null && globs.length > 0) {
      workspaceDirs = await resolveWorkspaceDirs(root, globs)
      isMonorepo = true
    } else {
      // Single-package mode: root itself is the only workspace.
      workspaceDirs = [root]
      isMonorepo = false
    }

    // 4. Build package nodes and collect all dep names.
    const packageNodes: ReturnType<typeof makePackageNode>[] = []
    const workspaceNames = new Set<string>()
    const allDepNames = new Set<string>()

    for (const dir of workspaceDirs) {
      // In monorepo mode the root dir is the container — skip it.
      if (isMonorepo && dir === root) continue

      const pkgJsonPath = join(dir, 'package.json')
      const pkg = await readJson(pkgJsonPath)
      if (pkg === null) continue

      // Derive name: use package.json name or fallback to relative dir.
      const name = pkg.name ?? (dir.replace(root, '').replace(/^\//, '') || dir)

      workspaceNames.add(name)

      packageNodes.push(makePackageNode(name))

      for (const dep of collectDeps(pkg)) {
        allDepNames.add(dep)
      }
    }

    // In single-package mode, also collect deps from root pkg.
    if (!isMonorepo) {
      for (const dep of collectDeps(rootPkg)) {
        allDepNames.add(dep)
      }
    }

    // 5. Build external nodes — skip internal workspace package names.
    const externalNodes = Array.from(allDepNames)
      .filter((dep) => !workspaceNames.has(dep))
      .map((dep) => makeExternalNode(dep))

    return {
      nodes: [...packageNodes, ...externalNodes],
      edges: [],
      evidence: [],
    }
  },
}

function makePackageNode(name: string) {
  return {
    id: `package:${name}`,
    kind: 'package' as const,
    title: name,
    layer: 'unknown' as const,
    status: 'unknown' as const,
    tags: [] as string[],
    files: [] as string[],
    metadata: {} as Record<string, unknown>,
  }
}

function makeExternalNode(name: string) {
  return {
    id: `external:${name}`,
    kind: 'external' as const,
    title: name,
    layer: 'unknown' as const,
    status: 'unknown' as const,
    tags: [] as string[],
    files: [] as string[],
    metadata: {} as Record<string, unknown>,
  }
}
