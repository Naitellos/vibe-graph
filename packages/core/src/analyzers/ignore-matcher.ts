import { DEFAULT_IGNORE_PATTERNS } from '../config/defaults.js'
import ignore = require('ignore')

export interface IgnoreMatcher {
  ignores(relPath: string): boolean
  /** Merged pattern list (defaults first, then user). Useful as a coarse seed for the file glob. */
  readonly patterns: readonly string[]
}

export interface CreateIgnoreMatcherOptions {
  patterns: readonly string[]
  includeDefaults: boolean
}

export function createIgnoreMatcher(opts: CreateIgnoreMatcherOptions): IgnoreMatcher {
  const merged: string[] = []
  if (opts.includeDefaults) merged.push(...DEFAULT_IGNORE_PATTERNS)
  merged.push(...opts.patterns)
  const ig = ignore.default().add(merged)
  return {
    ignores: (relPath) => ig.ignores(relPath),
    patterns: merged,
  }
}
