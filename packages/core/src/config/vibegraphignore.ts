import { existsSync, readFileSync } from 'node:fs'
import { join } from 'node:path'

/**
 * Read user ignore patterns from <projectRoot>/.vibegraphignore (gitignore syntax).
 * Missing file → [].
 * Comments (lines starting with #) and blank lines are filtered out.
 * Negation patterns (!important.ts) are preserved as-is.
 */
export function readVibegraphignorePatterns(projectRoot: string): string[] {
  const path = join(projectRoot, '.vibegraphignore')
  if (!existsSync(path)) return []
  return readFileSync(path, 'utf8')
    .split('\n')
    .map((l) => l.trim())
    .filter((l) => l.length > 0 && !l.startsWith('#'))
}
