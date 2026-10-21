import { spawnSync } from 'node:child_process'
import { existsSync } from 'node:fs'
import { realpath } from 'node:fs/promises'
import { dirname, join, parse, resolve } from 'node:path'

export interface ResolveProjectRootOptions {
  explicit: string | undefined
  cwd: string
}

/**
 * Cascade per spec §5.2:
 *   1. --root (explicit)
 *   2. .vibegraph/config.yml upward
 *   3. git root (via `git rev-parse --show-toplevel`, spawned without shell)
 *   4. package.json upward
 *   5. cwd
 *
 * Always normalized through realpath so symlinks/worktrees produce stable node ids.
 */
export async function resolveProjectRoot(opts: ResolveProjectRootOptions): Promise<string> {
  if (opts.explicit) return await realpath(resolve(opts.explicit))

  const cwd = await realpath(resolve(opts.cwd))

  const fromConfig = findUpward(cwd, (dir) => existsSync(join(dir, '.vibegraph', 'config.yml')))
  if (fromConfig) return await realpath(fromConfig)

  const gitRoot = tryGitRoot(cwd)
  if (gitRoot) return await realpath(gitRoot)

  const fromPkg = findUpward(cwd, (dir) => existsSync(join(dir, 'package.json')))
  if (fromPkg) return await realpath(fromPkg)

  return cwd
}

/**
 * Spawn `git rev-parse --show-toplevel` with args as an array (no shell).
 * Returns the root path on success, or null on any failure / non-git dir.
 */
function tryGitRoot(cwd: string): string | null {
  const r = spawnSync('git', ['rev-parse', '--show-toplevel'], {
    cwd,
    stdio: ['ignore', 'pipe', 'ignore'],
    encoding: 'utf-8',
    shell: false,
  })
  if (r.status !== 0) return null
  const out = r.stdout.trim()
  return out.length > 0 ? out : null
}

function findUpward(start: string, predicate: (dir: string) => boolean): string | null {
  let cur = start
  const { root } = parse(cur)
  while (true) {
    if (predicate(cur)) return cur
    if (cur === root) return null
    const parent = dirname(cur)
    if (parent === cur) return null
    cur = parent
  }
}
