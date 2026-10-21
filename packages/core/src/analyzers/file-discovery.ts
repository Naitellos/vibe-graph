import { relative } from 'node:path'
import { glob } from 'tinyglobby'
import type { IgnoreMatcher } from './ignore-matcher.js'

export interface DiscoverFilesOptions {
  projectRoot: string
  ignore: IgnoreMatcher
}

const PATTERNS = ['**/*.ts', '**/*.tsx', '**/*.js', '**/*.jsx', '**/*.mjs', '**/*.cjs']

/**
 * Build the coarse ignore list for tinyglobby.
 *
 * tinyglobby's `ignore` option does not understand gitignore-style negations
 * ("!pattern"). If we pass a positive pattern that would block a path that a
 * negation is meant to restore, tinyglobby will never yield that path and the
 * fine filter cannot un-ignore it.
 *
 * Strategy: exclude from the coarse list any positive pattern P where there
 * exists a negation "!N" such that P would match N.  Those paths are handled
 * exclusively by the fine IgnoreMatcher pass.
 */
function buildCoarseIgnore(patterns: readonly string[]): string[] {
  const positives = patterns.filter((p) => !p.startsWith('!'))
  const negationPaths = patterns.filter((p) => p.startsWith('!')).map((p) => p.slice(1))

  if (negationPaths.length === 0) return positives

  // Use the ignore library (via IgnoreMatcher internal logic) is unavailable
  // here, so we do a lightweight check: would a single positive pattern block
  // any negation path?  We could construct a single-rule ignore instance, but
  // to avoid importing `ignore` directly we use a simpler heuristic:
  // a positive pattern P "blocks" a negation path N when N starts with the
  // directory prefix of P (e.g. "logs/**" blocks "logs/important.ts").
  return positives.filter((pattern) => {
    // Strip trailing "/**" or "/*" to get the directory prefix.
    const prefix = pattern.replace(/\/\*\*?$/, '').replace(/\*\*?$/, '')
    return !negationPaths.some((n) => n === prefix || n.startsWith(`${prefix}/`))
  })
}

export async function discoverFiles(opts: DiscoverFilesOptions): Promise<string[]> {
  // Coarse pass via tinyglobby (faster path filtering at FS level).
  // expandDirectories: false keeps a plain entry like `dist` as that one path
  // instead of rewriting it to `dist/**`.
  const coarse = await glob(PATTERNS, {
    cwd: opts.projectRoot,
    absolute: true,
    dot: false,
    expandDirectories: false,
    ignore: buildCoarseIgnore(opts.ignore.patterns),
  })

  // Fine pass via IgnoreMatcher to honor gitignore-style negation and any
  // patterns that were intentionally skipped in the coarse pass.
  return coarse.filter((abs) => {
    const rel = relative(opts.projectRoot, abs)
    return !opts.ignore.ignores(rel)
  })
}
