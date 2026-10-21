import type { LoadedSnapshot } from '../snapshot/load-snapshot.js'

export type FileRole = 'entry' | 'core' | 'test' | 'config'

export interface PickCriticalFilesOptions {
  /** Max files to return. Default 10. */
  maxFiles?: number
}

export interface CriticalFile {
  fileNodeId: string
  /** Relative path (extracted from fileNodeId by stripping 'file:' prefix). */
  path: string
  role: FileRole
}

/** Role precedence order: lower number = higher priority. */
const ROLE_PRECEDENCE: Record<FileRole, number> = {
  entry: 0,
  core: 1,
  test: 2,
  config: 3,
}

/**
 * Infer the role of a file from its basename.
 *
 * Priority:
 *   entry  → index.ts / main.ts / app.tsx / server.ts / bin.js etc.
 *   test   → *.test.ts / *.spec.ts / *_test.ts etc.
 *   config → *.config.ts / tsconfig.json / biome.json etc.
 *   core   → everything else
 */
export function inferRole(path: string): FileRole {
  const base = path.split('/').pop() ?? path // basename
  // entry: index, main, app, server, bin
  if (/^(index|main|app|server|bin)\.(ts|tsx|js|jsx|mjs|cjs)$/.test(base)) return 'entry'
  // test: *.test.ts, *.spec.tsx, *_test.js
  if (/\.(test|spec)\.[tj]sx?$/.test(base) || /_test\.[tj]sx?$/.test(base)) return 'test'
  // config: *.config.ts / well-known config file roots
  if (/\.config\.[tj]sx?$/.test(base)) return 'config'
  if (
    /^(tsconfig|jsconfig|package|biome|vitest|tailwind|webpack|rollup|vite|babel|jest|tsup)(\..*)?\.(json|js|ts|cjs|mjs|yaml|yml)$/.test(
      base,
    )
  )
    return 'config'
  // default
  return 'core'
}

/**
 * Pick files belonging to a target node, ordered by inferred role:
 *   entry > core > test > config
 * Within each role, files are sorted alphabetically for determinism.
 */
export function pickCriticalFiles(
  snapshot: LoadedSnapshot,
  targetNodeId: string,
  options: PickCriticalFilesOptions = {},
): CriticalFile[] {
  const maxFiles = options.maxFiles ?? 10

  // If target is itself a file node, return just that file.
  if (targetNodeId.startsWith('file:')) {
    const path = targetNodeId.slice('file:'.length)
    return [{ fileNodeId: targetNodeId, path, role: inferRole(path) }]
  }

  // Find all outgoing 'contains' edges from the target node.
  const outgoing = snapshot.edgesByNodeId.get(targetNodeId) ?? []
  const containsEdges = outgoing.filter((e) => e.kind === 'contains')

  if (containsEdges.length === 0) {
    return []
  }

  // Map each contained file to a CriticalFile.
  const files: CriticalFile[] = containsEdges.map((edge) => {
    const fileNodeId = edge.to
    const path = fileNodeId.slice('file:'.length)
    return { fileNodeId, path, role: inferRole(path) }
  })

  // Sort by role precedence, then alphabetically by path.
  files.sort((a, b) => {
    const roleDiff = ROLE_PRECEDENCE[a.role] - ROLE_PRECEDENCE[b.role]
    if (roleDiff !== 0) return roleDiff
    return a.path.localeCompare(b.path)
  })

  return files.slice(0, maxFiles)
}
