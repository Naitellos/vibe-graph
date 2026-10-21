import { readFile, readdir } from 'node:fs/promises'
import { join, relative } from 'node:path'
import picomatch = require('picomatch')
import { parse as parseYaml } from 'yaml'
import type { VibegraphConfig } from '../config/config-yml.js'
import type { Layer } from '../schema/common.js'
import type { Edge } from '../schema/edge.js'
import type { Node } from '../schema/node.js'
import type { Analyzer, AnalyzerContext, AnalyzerResult } from './types.js'
import { globWorkspaceDirs } from './workspace-dirs.js'

const LAYER_PATTERNS: Array<[RegExp, Layer]> = [
  [/^(client|ui|web|frontend|app|components?|pages|views)$/i, 'horizontal'],
  [/^(server|backend|api|services?|domain|core|lib|modules?)$/i, 'domain'],
  [/^(infra|deploy|ops|config|scripts?|tooling)$/i, 'infra'],
]

function inferLayer(dirName: string): Layer {
  for (const [re, layer] of LAYER_PATTERNS) if (re.test(dirName)) return layer
  return 'unknown'
}

const NON_CODE_DIRS = new Set([
  'docs',
  'doc',
  'assets',
  'public',
  'static',
  'migrations',
  'fixtures',
  '__fixtures__',
  '__mocks__',
  '__tests__',
  'coverage',
  'dist',
  'build',
  'node_modules',
  '.vibegraph',
])
const SOURCE_EXT = /\.(tsx?|jsx?|mjs|cjs)$/i
const MIN_SOURCE_FILES = 3

function detectTopLevelSourceSubsystems(root: string, files: readonly string[]): AutoSubsystem[] {
  const counts = new Map<string, number>()
  for (const abs of files) {
    if (!SOURCE_EXT.test(abs)) continue
    const rel = relative(root, abs).replaceAll('\\', '/')
    const seg = rel.split('/')[0]
    if (seg === undefined || seg === '' || seg === rel) continue // root-level file, no dir
    if (seg.startsWith('.')) continue
    // Exclusion is case-insensitive, but the subsystem id/srcPrefix keep the
    // dir's original case — srcPrefix is matched against real (case-sensitive)
    // relative paths in fileMatchesAutoSub, so lowercasing would break matching.
    if (NON_CODE_DIRS.has(seg.toLowerCase())) continue
    counts.set(seg, (counts.get(seg) ?? 0) + 1)
  }
  const subs: AutoSubsystem[] = []
  for (const [dir, n] of [...counts.entries()].sort((a, b) => a[0].localeCompare(b[0]))) {
    if (n < MIN_SOURCE_FILES) continue
    subs.push({ id: dir, title: dir, srcPrefix: `${dir}/`, layer: inferLayer(dir) })
  }
  return subs
}

interface PackageJson {
  name?: string
  workspaces?: string[] | { packages: string[] }
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

/** Detect workspace glob patterns from pnpm-workspace.yaml or package.json workspaces field. */
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

interface AutoSubsystem {
  id: string
  title: string
  /** For monorepo mode: absolute directory for this workspace. For flat mode: undefined (use prefix). */
  workspaceDir?: string
  /** For flat mode: relative path prefix like 'src/dirname/'. */
  srcPrefix?: string
  layer?: Layer
}

/**
 * One subsystem per top-level directory of a workspace package's source root.
 *
 * Prefers `<pkg>/src`, falling back to the package directory itself for packages
 * that keep sources at the top level. Ids are `<package>/<dir>` so they stay
 * readable and unique across packages.
 */
async function detectPackageFeatureSubsystems(
  pkgDir: string,
  pkgName: string,
): Promise<AutoSubsystem[]> {
  const srcRoot = join(pkgDir, 'src')
  let base = srcRoot
  let entries: Awaited<ReturnType<typeof readdir>>
  try {
    entries = await readdir(srcRoot, { withFileTypes: true })
  } catch {
    base = pkgDir
    try {
      entries = await readdir(pkgDir, { withFileTypes: true })
    } catch {
      return []
    }
  }
  return entries
    .filter((e) => e.isDirectory() && !e.name.startsWith('.') && e.name !== 'node_modules')
    .map((e) => ({
      id: `${pkgName}/${e.name}`,
      title: `${pkgName}/${e.name}`,
      workspaceDir: join(base, e.name),
      layer: inferLayer(e.name),
    }))
}

/** Auto-detect subsystems from workspace dirs or src/ subdirs. Returns [] if none found. */
async function detectAutoSubsystems(
  root: string,
  files: readonly string[],
  granularity: 'package' | 'feature' = 'package',
): Promise<AutoSubsystem[]> {
  const rootPkgPath = join(root, 'package.json')
  const rootPkg = await readJson(rootPkgPath)

  const globs = rootPkg !== null ? await detectWorkspaceGlobs(root, rootPkg) : null
  const isMonorepo = globs !== null && globs.length > 0

  if (isMonorepo) {
    const workspaceDirs = await resolveWorkspaceDirs(root, globs)
    const subs: AutoSubsystem[] = []
    for (const dir of workspaceDirs) {
      const pkgJsonPath = join(dir, 'package.json')
      const pkg = await readJson(pkgJsonPath)
      if (pkg === null) continue
      const name = pkg.name ?? relative(root, dir).replaceAll('\\', '/')
      if (granularity === 'feature') {
        subs.push(...(await detectPackageFeatureSubsystems(dir, name)))
      }
      // Always emit the package itself. At feature granularity it is the fallback
      // for files sitting at the package's source root (`server.js`, `App.jsx`);
      // most-specific-first matching means the feature dirs win where they apply.
      subs.push({ id: name, title: name, workspaceDir: dir })
    }
    return subs
  }

  // Flat mode: prefer src/ subdirs if present
  const srcDir = join(root, 'src')
  let srcEntries: Awaited<ReturnType<typeof readdir>>
  try {
    srcEntries = await readdir(srcDir, { withFileTypes: true })
  } catch {
    // No src/ dir — fall back to top-level source dirs
    return detectTopLevelSourceSubsystems(root, files)
  }

  const subdirs = srcEntries.filter((e) => e.isDirectory()).map((e) => e.name)
  return subdirs.map((dirname) => ({
    id: dirname,
    title: dirname,
    srcPrefix: `src/${dirname}/`,
  }))
}

/** Check if an absolute file path belongs to an auto-detected subsystem. */
function fileMatchesAutoSub(root: string, absPath: string, sub: AutoSubsystem): boolean {
  if (sub.workspaceDir !== undefined) {
    const workspaceDir = sub.workspaceDir.endsWith('/')
      ? sub.workspaceDir.slice(0, -1)
      : sub.workspaceDir
    return absPath.startsWith(`${workspaceDir}/`)
  }
  if (sub.srcPrefix !== undefined) {
    const relPath = relative(root, absPath).replaceAll('\\', '/')
    return relPath.startsWith(sub.srcPrefix)
  }
  return false
}

function makeSubsystemNode(
  id: string,
  title: string,
  layer?: VibegraphConfig['subsystems'][number]['layer'],
  status?: Node['status'],
  metadata?: Record<string, unknown>,
): Node {
  return {
    id: `subsystem:${id}`,
    kind: 'subsystem' as const,
    title,
    layer: layer ?? ('unknown' as const),
    status: status ?? ('unknown' as const),
    tags: [] as string[],
    files: [] as string[],
    metadata: metadata ?? {},
  }
}

function makeContainsEdge(subsystemId: string, fileNodeId: string): Edge {
  return {
    id: `${subsystemId}->${fileNodeId}:contains`,
    from: subsystemId,
    to: fileNodeId,
    kind: 'contains' as const,
    category: 'structural' as const,
    source: 'derived' as const,
    confidence: 'high' as const,
    evidenceIds: [],
    weight: 1,
    runtimeWeight: 0,
    typeOnlyWeight: 0,
    dynamicWeight: 0,
    metadata: {},
  }
}

export const coreSubsystemsAnalyzer: Analyzer = {
  id: 'core/subsystems',
  description: 'derives subsystem Nodes + contains Edges (auto/manual/hybrid mode)',

  async run(ctx: AnalyzerContext): Promise<AnalyzerResult> {
    const root = ctx.projectRoot
    const nodes: Node[] = []
    const edges: Edge[] = []

    // --- SubsystemDocs branch (prefers docs over auto/inline) ---
    if (ctx.subsystemDocs.length > 0) {
      if (ctx.config.subsystems.length > 0) {
        ctx.log.warn(
          'config.yml subsystems[] is shadowed by .vibegraph/subsystems/*.yml — remove inline entries',
        )
      }

      for (const doc of ctx.subsystemDocs) {
        // §UX5 — carry doc.status onto the Node so canvas coloring + dl Status
        // stay consistent with the SubsystemDocView status pill (was always
        // 'unknown' before).
        nodes.push(makeSubsystemNode(doc.id, doc.title, doc.layer, doc.status))
      }

      for (const absPath of ctx.files) {
        const relPath = relative(root, absPath).replaceAll('\\', '/')
        const fileNodeId = `file:${relPath}`

        for (const doc of ctx.subsystemDocs) {
          if (picomatch.isMatch(relPath, doc.match)) {
            edges.push(makeContainsEdge(`subsystem:${doc.id}`, fileNodeId))
            break
          }
        }
      }

      return { nodes, edges, evidence: [] }
    }

    // --- v0 path: auto-detect + inline config (unchanged) ---
    const mode = ctx.config.subsystemDetection.mode
    const manualSubs = ctx.config.subsystems

    // --- Auto subsystems (skip for manual mode) ---
    const granularity = ctx.config.subsystemDetection?.granularity ?? 'package'
    const rawAutoSubs =
      mode === 'manual' ? [] : await detectAutoSubsystems(root, ctx.files, granularity)

    // Build set of manual ids for collision filtering
    const manualIds = new Set(manualSubs.map((s) => s.id))

    // Auto subsystems: filter out any whose id collides with a manual sub
    const autoSubs = rawAutoSubs.filter((s) => !manualIds.has(s.id))

    // --- Emit subsystem Nodes ---
    // 1. Manual subsystems in declaration order
    for (const sub of manualSubs) {
      nodes.push(makeSubsystemNode(sub.id, sub.title, sub.layer))
    }
    // 2. Auto subsystems (filtered of collisions)
    for (const sub of autoSubs) {
      nodes.push(makeSubsystemNode(sub.id, sub.title, sub.layer, undefined, { autoDetected: true }))
    }

    // --- Emit contains Edges ---
    // For each file, find its owning subsystem:
    //   1. Manual subs in declaration order (glob matching via picomatch)
    //   2. If no manual match (and mode != 'manual'), auto subs sorted alphabetically
    // Most-specific-first, then alphabetical. Feature subsystems nest inside their
    // package (`apps/backend/src/controllers` inside `apps/backend`), and the loop
    // below takes the FIRST match — so a purely alphabetical order would let the
    // enclosing package swallow every file before its own feature dirs were tried.
    // This is a no-op at package granularity, where no auto subsystem nests.
    const specificity = (s: AutoSubsystem): number => (s.workspaceDir ?? s.srcPrefix ?? '').length
    const sortedAutoSubs = [...autoSubs].sort(
      (a, b) => specificity(b) - specificity(a) || a.id.localeCompare(b.id),
    )

    for (const absPath of ctx.files) {
      const relPath = relative(root, absPath).replaceAll('\\', '/')
      const fileNodeId = `file:${relPath}`

      // Try manual subs first (declaration order)
      let matched = false
      for (const sub of manualSubs) {
        if (picomatch.isMatch(relPath, sub.match)) {
          edges.push(makeContainsEdge(`subsystem:${sub.id}`, fileNodeId))
          matched = true
          break
        }
      }

      if (matched) continue

      // No manual match — fall back to auto (only if mode is 'auto' or 'hybrid')
      if (mode === 'manual') continue

      for (const sub of sortedAutoSubs) {
        if (fileMatchesAutoSub(root, absPath, sub)) {
          edges.push(makeContainsEdge(`subsystem:${sub.id}`, fileNodeId))
          break
        }
      }
    }

    return { nodes, edges, evidence: [] }
  },
}
