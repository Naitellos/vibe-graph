import { existsSync } from 'node:fs'
import { homedir } from 'node:os'
import { join } from 'node:path'

export type DetectedIde = 'claude-code' | 'cursor'

export interface DetectIdeOptions {
  projectRoot: string
  /** Override for tests. Defaults to os.homedir(). */
  homeDir?: string
}

export interface DetectIdeResult {
  ides: DetectedIde[]
  /** Where each IDE was found (for debugging / logging). */
  evidence: Array<{ ide: DetectedIde; source: string }>
}

/**
 * Detects which IDEs the user has installed/configured.
 *
 * Claude Code: project-local `.claude/` directory OR user-level `~/.claude/`.
 * Cursor: project-local `.cursor/` directory.
 *
 * Pure synchronous file-existence checks. Never throws.
 */
export function detectIde(opts: DetectIdeOptions): DetectIdeResult {
  const home = opts.homeDir ?? homedir()
  const evidence: DetectIdeResult['evidence'] = []
  const seen = new Set<DetectedIde>()

  const projectClaude = join(opts.projectRoot, '.claude')
  if (existsSync(projectClaude)) {
    if (!seen.has('claude-code')) {
      evidence.push({ ide: 'claude-code', source: projectClaude })
      seen.add('claude-code')
    }
  }
  const homeClaude = join(home, '.claude')
  if (existsSync(homeClaude)) {
    if (!seen.has('claude-code')) {
      evidence.push({ ide: 'claude-code', source: homeClaude })
      seen.add('claude-code')
    }
  }

  const projectCursor = join(opts.projectRoot, '.cursor')
  if (existsSync(projectCursor)) {
    evidence.push({ ide: 'cursor', source: projectCursor })
    seen.add('cursor')
  }

  return { ides: [...seen], evidence }
}
