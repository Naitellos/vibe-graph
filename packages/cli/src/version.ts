import { readFile } from 'node:fs/promises'
import { dirname, join } from 'node:path'
import { fileURLToPath } from 'node:url'

interface PackageJson {
  version?: string
}

/**
 * Resolves the CLI version by reading the nearest package.json at runtime.
 * Searches from the bundled dist/ outward. Falls back to 'unknown' on failure
 * (e.g. if package.json is missing in unusual install scenarios).
 */
export async function loadVibegraphVersion(): Promise<string> {
  try {
    const here = dirname(fileURLToPath(import.meta.url))
    // dist/version.js → package.json is one level up
    const pkgPath = join(here, '..', 'package.json')
    const raw = await readFile(pkgPath, 'utf-8')
    const pkg = JSON.parse(raw) as PackageJson
    return typeof pkg.version === 'string' && pkg.version.length > 0 ? pkg.version : 'unknown'
  } catch {
    return 'unknown'
  }
}

// Synchronous fallback for use sites that can't await (rare).
// Static value matches package.json's version field — bumped in lockstep at release time.
// Prefer loadVibegraphVersion() for accuracy.
export const VIBEGRAPH_VERSION_FALLBACK = '0.0.0'
