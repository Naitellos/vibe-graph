import { spawnSync } from 'node:child_process'
import { dirname, join, resolve } from 'node:path'
import { fileURLToPath } from 'node:url'
import { describe, expect, it } from 'vitest'

// Note: the CLI is built once in test/e2e/global-setup.ts before any e2e test runs.

const __dirname = dirname(fileURLToPath(import.meta.url))
const repoRoot = resolve(__dirname, '../..')
const binPath = join(repoRoot, 'packages/cli/dist/bin.js')
// Use the absolute path to node so the test works in vitest worker environments
// where PATH may be limited.
const nodeBin = process.execPath

// citty renders help/version via consola. When NODE_ENV=test or TEST=true (set by vitest),
// consola silences log-level messages. Unset those env vars and set CONSOLA_LEVEL=3
// (LogLevels.log) so --help and --version print normally in the subprocess.
const { TEST: _TEST, VITEST: _VITEST, ...inheritedEnv } = process.env
const spawnEnv = { ...inheritedEnv, NODE_ENV: 'production', CONSOLA_LEVEL: '3' }

describe('vibe-graph CLI', () => {
  it('--help lists all 7 commands', () => {
    const result = spawnSync(nodeBin, [binPath, '--help'], {
      stdio: 'pipe',
      shell: false,
      encoding: 'utf-8',
      env: spawnEnv,
    })
    expect(result.status).toBe(0)
    const out = result.stdout + result.stderr
    // citty prints subcommand names in the help output
    for (const cmd of ['init', 'scan', 'mcp', 'doctor', 'context', 'impact']) {
      expect(out).toContain(cmd)
    }
  })

  it('--version prints non-empty', () => {
    const result = spawnSync(nodeBin, [binPath, '--version'], {
      stdio: 'pipe',
      shell: false,
      encoding: 'utf-8',
      env: spawnEnv,
    })
    expect(result.status).toBe(0)
    expect(result.stdout.trim().length).toBeGreaterThan(0)
  })
})
