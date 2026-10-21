// packages/mcp/test/stdio-smoke.test.ts
//
// End-to-end MCP stdio smoke test (Phase 3 exit criterion, extended in Phase 4).
//
// Spawns `node dist/bin.js --project-root <simple-cycle>` as a child process
// and communicates over JSON-RPC line-delimited stdio. Verifies:
//   1. tools/list returns the 6 expected tools with inputSchema + outputSchema.
//   2. tools/call for get_project_overview returns correct counts for the
//      simple-cycle fixture (2 subsystems, 4 files, ≥1 finding).

import { type ChildProcessWithoutNullStreams, spawnSync } from 'node:child_process'
import { spawn } from 'node:child_process'
import { dirname, join, resolve } from 'node:path'
import { fileURLToPath } from 'node:url'
import { afterAll, beforeAll, describe, expect, it } from 'vitest'

const __dirname = dirname(fileURLToPath(import.meta.url))

// Repo root is three levels up from packages/mcp/test/
const repoRoot = resolve(__dirname, '../../..')
const fixtureRoot = join(repoRoot, 'fixtures/synthetic/simple-cycle')
const binPath = join(repoRoot, 'packages/mcp/dist/bin.js')

describe('MCP stdio smoke test', () => {
  beforeAll(() => {
    if (process.env.VIBEGRAPH_TEST_SKIP_BUILDS === '1') return

    // Build @codearch/core (provides the scanner and snapshot reader) and
    // @codearch/mcp (produces dist/bin.js). Both use tsup; the build is
    // idempotent and typically takes <5 s after the first run.
    spawnSync('pnpm', ['--filter', '@codearch/core', '--filter', '@codearch/mcp', 'build'], {
      cwd: repoRoot,
      stdio: 'pipe',
      shell: false,
    })
  }, 120_000)

  it('responds to tools/list with exactly 8 tools', async () => {
    const child = spawnBin(fixtureRoot)
    try {
      const resp = await sendRequest(child, { jsonrpc: '2.0', id: 1, method: 'tools/list' })

      expect(resp.result).toBeDefined()
      const tools = (
        resp.result as {
          tools: Array<{ name: string; inputSchema: unknown; outputSchema: unknown }>
        }
      ).tools
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

      // Each tool must expose both input and output schemas
      for (const t of tools) {
        expect(t.inputSchema, `${t.name} must have inputSchema`).toBeDefined()
        expect(t.outputSchema, `${t.name} must have outputSchema`).toBeDefined()
      }
    } finally {
      child.kill()
    }
  }, 60_000)

  it('responds to tools/call for get_project_overview with correct counts', async () => {
    const child = spawnBin(fixtureRoot)
    try {
      const resp = await sendRequest(child, {
        jsonrpc: '2.0',
        id: 2,
        method: 'tools/call',
        params: { name: 'get_project_overview', arguments: { verbose: false } },
      })

      expect(resp.result).toBeDefined()
      // Must not be an error response
      expect((resp.result as { isError?: boolean }).isError).toBeUndefined()

      const result = resp.result as {
        structuredContent: {
          project: { name: string }
          counts: { subsystems: number; files: number; findings: number }
        }
        content: Array<{ type: string; text: string }>
      }

      // simple-cycle fixture: 2 subsystems (auth, billing), 4 file nodes, 1 cycle finding
      expect(result.structuredContent.project.name).toBe('simple-cycle')
      expect(result.structuredContent.counts.subsystems).toBe(2)
      expect(result.structuredContent.counts.files).toBe(4)
      expect(result.structuredContent.counts.findings).toBeGreaterThanOrEqual(1)

      // Text fallback (content[0]) must be present
      expect(result.content[0]?.type).toBe('text')
      expect(typeof result.content[0]?.text).toBe('string')
    } finally {
      child.kill()
    }
  }, 60_000)
})

// ─── Helpers ──────────────────────────────────────────────────────────────────

function spawnBin(projectRoot: string): ChildProcessWithoutNullStreams {
  const child = spawn('node', [binPath, '--project-root', projectRoot], {
    cwd: projectRoot,
    stdio: ['pipe', 'pipe', 'pipe'],
    shell: false, // project gotcha #1: never shell-interpolated
  })
  child.stderr.on('data', (chunk: Buffer) => {
    // Pino logs (if any) go to stderr. Forward for debugging but don't fail.
    process.stderr.write(`[mcp-child] ${chunk}`)
  })
  return child
}

interface JsonRpcRequest {
  jsonrpc: '2.0'
  id: number
  method: string
  params?: Record<string, unknown>
}

interface JsonRpcResponse {
  jsonrpc: '2.0'
  id: number
  // biome-ignore lint/suspicious/noExplicitAny: intentional — response shape varies by tool
  result?: any
  error?: { code: number; message: string }
}

/**
 * Write a JSON-RPC request line to the child's stdin and collect the first
 * response line whose `id` matches the request id.
 *
 * MCP's StdioServerTransport is line-delimited (one JSON object per line).
 * The promise rejects after 30 s if no matching response arrives.
 */
async function sendRequest(
  child: ChildProcessWithoutNullStreams,
  request: JsonRpcRequest,
): Promise<JsonRpcResponse> {
  const requestLine = `${JSON.stringify(request)}\n`

  return new Promise<JsonRpcResponse>((resolveFn, rejectFn) => {
    let buffer = ''

    const onData = (chunk: Buffer): void => {
      buffer += chunk.toString('utf-8')

      let nl: number
      // biome-ignore lint/suspicious/noAssignInExpressions: idiomatic line-reader loop
      while ((nl = buffer.indexOf('\n')) !== -1) {
        const line = buffer.slice(0, nl)
        buffer = buffer.slice(nl + 1)
        if (line.trim().length === 0) continue

        try {
          const parsed = JSON.parse(line) as JsonRpcResponse
          if (parsed.id === request.id) {
            child.stdout.off('data', onData)
            clearTimeout(timer)
            resolveFn(parsed)
            return
          }
        } catch {
          // Non-JSON line (e.g. pino startup log) — skip.
        }
      }
    }

    const timer = setTimeout(() => {
      child.stdout.off('data', onData)
      rejectFn(new Error(`[stdio-smoke] timed out waiting for response to id ${request.id}`))
    }, 30_000)

    child.stdout.on('data', onData)

    child.stdin.write(requestLine, (err) => {
      if (err) {
        clearTimeout(timer)
        rejectFn(err)
      }
    })
  })
}
