import { spawnSync } from 'node:child_process'
import type { Check, CheckResult } from './types.js'

const MIN_NODE_MAJOR = 22
const MIN_NODE_MINOR = 12

export const nodeVersionCheck: Check = {
  id: 'system/node-version',
  description: 'Node.js version >= 22.12',
  async run(): Promise<CheckResult> {
    const version = process.version // e.g. "v22.12.0"
    const match = /^v?(\d+)\.(\d+)(\.\d+)?/.exec(version)
    if (match === null) {
      return {
        id: nodeVersionCheck.id,
        status: 'warn',
        message: `Could not parse Node.js version: ${version}`,
        suggestion: 'Update to Node.js >=22.12 (LTS)',
      }
    }
    const major = Number(match[1])
    const minor = Number(match[2])
    if (major > MIN_NODE_MAJOR || (major === MIN_NODE_MAJOR && minor >= MIN_NODE_MINOR)) {
      return {
        id: nodeVersionCheck.id,
        status: 'ok',
        message: `Node.js ${version} (>=22.12 required)`,
      }
    }
    return {
      id: nodeVersionCheck.id,
      status: 'error',
      message: `Node.js ${version} is below the required 22.12`,
      suggestion: 'Install Node.js 22.12 LTS or newer (https://nodejs.org/)',
    }
  },
}

export const pnpmCheck: Check = {
  id: 'system/pnpm',
  description: 'pnpm is on PATH',
  async run(): Promise<CheckResult> {
    if (which('pnpm') !== null) {
      return {
        id: pnpmCheck.id,
        status: 'ok',
        message: 'pnpm is available',
      }
    }
    return {
      id: pnpmCheck.id,
      status: 'warn',
      message: 'pnpm not found on PATH',
      suggestion: 'Install pnpm: `npm install -g pnpm@9` (recommended for monorepo support)',
    }
  },
}

export const gitCheck: Check = {
  id: 'system/git',
  description: 'git is on PATH',
  async run(): Promise<CheckResult> {
    if (which('git') !== null) {
      return {
        id: gitCheck.id,
        status: 'ok',
        message: 'git is available',
      }
    }
    return {
      id: gitCheck.id,
      status: 'warn',
      message: 'git not found on PATH',
      suggestion:
        'Install git (https://git-scm.com/). Vibe Graph uses git to detect project roots.',
    }
  },
}

export const SYSTEM_CHECKS: readonly Check[] = [nodeVersionCheck, pnpmCheck, gitCheck]

/**
 * Resolve a binary on PATH using `which` (POSIX). Returns the absolute path,
 * or null if not found.
 *
 * NOTE: Windows uses `where` instead of `which`. For v0 we target Unix (macOS/Linux);
 * Windows support is deferred — on Windows this will return null for all binaries.
 *
 * Spawned with shell: false per project convention (never interpolate strings).
 */
export function which(bin: string): string | null {
  const result = spawnSync('which', [bin], {
    stdio: ['ignore', 'pipe', 'ignore'],
    encoding: 'utf-8',
    shell: false,
  })
  if (result.status !== 0) return null
  const out = result.stdout.trim()
  return out.length > 0 ? out : null
}
