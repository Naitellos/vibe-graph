import { existsSync } from 'node:fs'
import { readFile } from 'node:fs/promises'
import { join } from 'node:path'
import { parse as parseYaml } from 'yaml'

export type StackLanguage = 'typescript' | 'javascript'
export type PackageManager = 'pnpm' | 'yarn' | 'npm' | 'unknown'

export interface DetectedStack {
  language: StackLanguage
  packageManager: PackageManager
  monorepo: boolean
  /** Soft heuristic — strings like 'react', 'next', 'vue', 'svelte', 'express'. */
  frameworks: string[]
}

export interface DetectStackOptions {
  projectRoot: string
}

interface PackageJsonShape {
  name?: string
  workspaces?: string[] | { packages?: string[] }
  packageManager?: string
  dependencies?: Record<string, string>
  devDependencies?: Record<string, string>
  peerDependencies?: Record<string, string>
}

/**
 * Detects the project stack via heuristics on package.json + lockfiles + workspace
 * markers. Returns a typed result. Pure async I/O — never throws.
 */
export async function detectStack(opts: DetectStackOptions): Promise<DetectedStack> {
  const root = opts.projectRoot
  const pkgPath = join(root, 'package.json')

  let pkg: PackageJsonShape | null = null
  if (existsSync(pkgPath)) {
    try {
      const raw = await readFile(pkgPath, 'utf-8')
      pkg = JSON.parse(raw) as PackageJsonShape
    } catch {
      pkg = null
    }
  }

  const language = detectLanguage(root, pkg)
  const packageManager = await detectPackageManager(root, pkg)
  const monorepo = await detectMonorepo(root, pkg)
  const frameworks = detectFrameworks(pkg)

  return { language, packageManager, monorepo, frameworks }
}

function detectLanguage(root: string, pkg: PackageJsonShape | null): StackLanguage {
  // Strong signal: tsconfig.json
  if (existsSync(join(root, 'tsconfig.json'))) return 'typescript'
  // Look for TS in deps
  if (pkg !== null) {
    const allDeps = { ...pkg.dependencies, ...pkg.devDependencies, ...pkg.peerDependencies }
    if ('typescript' in allDeps) return 'typescript'
  }
  return 'javascript'
}

async function detectPackageManager(
  root: string,
  pkg: PackageJsonShape | null,
): Promise<PackageManager> {
  // 1. packageManager field in package.json (most authoritative)
  const pm = pkg?.packageManager
  if (typeof pm === 'string') {
    if (pm.startsWith('pnpm@')) return 'pnpm'
    if (pm.startsWith('yarn@')) return 'yarn'
    if (pm.startsWith('npm@')) return 'npm'
  }
  // 2. lockfile presence
  if (existsSync(join(root, 'pnpm-lock.yaml'))) return 'pnpm'
  if (existsSync(join(root, 'yarn.lock'))) return 'yarn'
  if (existsSync(join(root, 'package-lock.json'))) return 'npm'
  return 'unknown'
}

async function detectMonorepo(root: string, pkg: PackageJsonShape | null): Promise<boolean> {
  // pnpm
  const pnpmYaml = join(root, 'pnpm-workspace.yaml')
  if (existsSync(pnpmYaml)) {
    try {
      const raw = await readFile(pnpmYaml, 'utf-8')
      const parsed = parseYaml(raw) as { packages?: string[] }
      if (Array.isArray(parsed?.packages) && parsed.packages.length > 0) return true
    } catch {
      // fall through
    }
  }
  // npm/yarn: workspaces field
  if (pkg !== null) {
    const ws = pkg.workspaces
    if (Array.isArray(ws) && ws.length > 0) return true
    if (!Array.isArray(ws) && typeof ws === 'object' && ws !== null) {
      if (Array.isArray(ws.packages) && ws.packages.length > 0) return true
    }
  }
  return false
}

const FRAMEWORK_MARKERS: ReadonlyArray<{ name: string; deps: string[] }> = [
  { name: 'next', deps: ['next'] },
  { name: 'react', deps: ['react'] },
  { name: 'vue', deps: ['vue'] },
  { name: 'svelte', deps: ['svelte', '@sveltejs/kit'] },
  { name: 'angular', deps: ['@angular/core'] },
  { name: 'express', deps: ['express'] },
  { name: 'fastify', deps: ['fastify'] },
  { name: 'nestjs', deps: ['@nestjs/core'] },
  { name: 'astro', deps: ['astro'] },
  { name: 'remix', deps: ['@remix-run/react', '@remix-run/node'] },
  { name: 'solid', deps: ['solid-js'] },
  { name: 'vite', deps: ['vite'] },
]

function detectFrameworks(pkg: PackageJsonShape | null): string[] {
  if (pkg === null) return []
  const all = {
    ...pkg.dependencies,
    ...pkg.devDependencies,
    ...pkg.peerDependencies,
  }
  const detected: string[] = []
  for (const marker of FRAMEWORK_MARKERS) {
    if (marker.deps.some((d) => d in all)) {
      detected.push(marker.name)
    }
  }
  return detected
}
