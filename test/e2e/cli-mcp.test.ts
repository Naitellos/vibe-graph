// test/e2e/cli-mcp.test.ts
//
// E2E smoke test for `vibe-graph mcp` via the unified CLI binary.
//
// Mirrors packages/mcp/test/stdio-smoke.test.ts but spawns
// `node packages/cli/dist/bin.js mcp` instead of `node packages/mcp/dist/bin.js`.

import { type ChildProcessWithoutNullStreams, spawn } from 'node:child_process'
import { dirname, join, resolve } from 'node:path'
import { fileURLToPath } from 'node:url'
import { describe, expect, it } from 'vitest'

import { sendRequest } from './helpers/jsonrpc.js'

// Note: build is handled in test/e2e/global-setup.ts

const __dirname = dirname(fileURLToPath(import.meta.url))
const repoRoot = resolve(__dirname, '../..')
const fixtureRoot = join(repoRoot, 'fixtures/synthetic/simple-cycle')
const binPath = join(repoRoot, 'packages/cli/dist/bin.js')

describe('vibe-graph mcp (E2E via unified CLI)', () => {
  it('responds to tools/list with exactly 8 tools', async () => {
    const child = spawnCliMcp(fixtureRoot)
    try {
      const resp = await sendRequest(child, { jsonrpc: '2.0', id: 1, method: 'tools/list' })
      expect(resp.result).toBeDefined()
      const tools = (resp.result as { tools: Array<{ name: string }> }).tools
      expect(tools).toHaveLength(8)
      const names = tools.map((t) => t.name).sort()
      expect(names).toEqual([
        'get_blast_radius',
        'get_context_pack',
        'get_project_overview',
        'get_subsystem',
        'get_subsystem_doc',
        'prepare_task',
        'validate_diff',
        'validate_drift',
      ])
    } finally {
      child.kill()
    }
  }, 60_000)
})

// ─── Helpers ──────────────────────────────────────────────────────────────────

function spawnCliMcp(projectRoot: string): ChildProcessWithoutNullStreams {
  const child = spawn('node', [binPath, 'mcp', '--project-root', projectRoot], {
    cwd: projectRoot,
    stdio: ['pipe', 'pipe', 'pipe'],
    shell: false,
  })
  child.stderr.on('data', (chunk: Buffer) => {
    // Logger writes to stderr in MCP mode — forward for debugging, don't fail.
    process.stderr.write(`[cli-mcp-child] ${chunk}`)
  })
  return child
}
