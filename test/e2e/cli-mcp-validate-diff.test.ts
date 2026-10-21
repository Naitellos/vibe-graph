// test/e2e/cli-mcp-validate-diff.test.ts
//
// E2E smoke test for `vibe-graph mcp` validate_diff tool.
//
// Setup:
// 1. Create a minimal project in tmpdir with config.yml + source files
// 2. Run `vibe-graph scan` to populate snapshot
// 3. Run `vibe-graph baseline` to write baseline.json
// 4. Spawn `vibe-graph mcp` over stdio
// 5. Send tools/call request with validate_diff (NO_BASELINE + ok + new-file)
// 6. Assert response structure

import { type ChildProcessWithoutNullStreams, spawn, spawnSync } from 'node:child_process'
import { existsSync } from 'node:fs'
import { mkdir, rm, writeFile } from 'node:fs/promises'
import { tmpdir } from 'node:os'
import { dirname, join, resolve } from 'node:path'
import { fileURLToPath } from 'node:url'
import { afterEach, beforeEach, describe, expect, it } from 'vitest'

import { sendRequest } from './helpers/jsonrpc.js'

// Note: build is handled in test/e2e/global-setup.ts

const __dirname = dirname(fileURLToPath(import.meta.url))
const repoRoot = resolve(__dirname, '../..')
const binPath = join(repoRoot, 'packages/cli/dist/bin.js')

describe('vibe-graph mcp validate_diff (E2E)', () => {
  let tmpRoot: string

  beforeEach(async () => {
    tmpRoot = join(tmpdir(), `vg-e2e-vd-${Date.now()}-${Math.floor(Math.random() * 1e9)}`)
    await mkdir(join(tmpRoot, 'src'), { recursive: true })
    await mkdir(join(tmpRoot, '.vibegraph', 'cache'), { recursive: true })
    await writeFile(join(tmpRoot, 'package.json'), '{"name":"e2e-vd","version":"0.0.0"}\n')
    await writeFile(
      join(tmpRoot, '.vibegraph', 'config.yml'),
      [
        'project:',
        '  name: e2e-vd',
        '  root: .',
        'subsystemDetection:',
        '  mode: manual',
        'subsystems:',
        '  - id: alpha',
        '    title: Alpha',
        '    layer: domain',
        '    match: ["src/**"]',
        '',
      ].join('\n'),
      'utf-8',
    )
    await writeFile(join(tmpRoot, 'src', 'a.ts'), 'export const A = 1\n', 'utf-8')
    await writeFile(join(tmpRoot, 'src', 'b.ts'), 'export const B = 2\n', 'utf-8')
  })

  afterEach(async () => {
    if (tmpRoot !== undefined && existsSync(tmpRoot)) {
      await rm(tmpRoot, { recursive: true, force: true })
    }
  })

  it('returns NO_BASELINE error when baseline.json absent', async () => {
    // Scan to populate snapshot but skip baseline — should error
    const scanResult = spawnSync('node', [binPath, 'scan', '--root', tmpRoot, '--json'], {
      cwd: tmpRoot,
      stdio: 'pipe',
      shell: false,
      encoding: 'utf-8',
    })
    expect(scanResult.status).toBe(0)

    const child = spawnCliMcp(tmpRoot)
    try {
      const resp = await sendRequest(child, {
        jsonrpc: '2.0',
        id: 1,
        method: 'tools/call',
        params: {
          name: 'validate_diff',
          arguments: {
            workingFiles: [],
            mode: 'advisory',
          },
        },
      })

      expect(resp.result).toBeDefined()
      const mcpResult = resp.result as Record<string, unknown>
      expect(mcpResult.isError).toBe(true)

      const sc = (mcpResult.structuredContent as Record<string, unknown>) ?? {}
      const err = sc.error as Record<string, unknown>
      expect(err).toBeDefined()
      expect(err.code).toBe('NO_BASELINE')
      expect(err.message as string).toMatch(/NO_BASELINE/)
    } finally {
      child.kill()
    }
  }, 120_000) // long timeout for subprocess spawn + mcp startup

  it('returns status=ok with empty deltas when nothing changed', async () => {
    // Scan + baseline with nothing changed
    const scanResult = spawnSync('node', [binPath, 'scan', '--root', tmpRoot, '--json'], {
      cwd: tmpRoot,
      stdio: 'pipe',
      shell: false,
      encoding: 'utf-8',
    })
    expect(scanResult.status).toBe(0)

    const baselineResult = spawnSync('node', [binPath, 'baseline', '--root', tmpRoot, '--json'], {
      cwd: tmpRoot,
      stdio: 'pipe',
      shell: false,
      encoding: 'utf-8',
    })
    expect(baselineResult.status).toBe(0)

    const child = spawnCliMcp(tmpRoot)
    try {
      const resp = await sendRequest(child, {
        jsonrpc: '2.0',
        id: 1,
        method: 'tools/call',
        params: {
          name: 'validate_diff',
          arguments: {
            workingFiles: [],
            mode: 'advisory',
          },
        },
      })

      expect(resp.result).toBeDefined()
      const mcpResult = resp.result as Record<string, unknown>
      expect(mcpResult.isError).toBeUndefined()

      const parsed = ((mcpResult.structuredContent as Record<string, unknown>) ??
        mcpResult) as Record<string, unknown>

      expect(parsed.status).toBe('ok')
      expect(Array.isArray(parsed.newFindings)).toBe(true)
      expect(parsed.newFindings as unknown[]).toEqual([])
      expect(Array.isArray(parsed.removedFindings)).toBe(true)
      expect(parsed.removedFindings as unknown[]).toEqual([])
      expect(typeof parsed.baselineSnapshotId).toBe('string')
      expect((parsed.baselineSnapshotId as string).length).toBeGreaterThan(0)
    } finally {
      child.kill()
    }
  }, 120_000) // long timeout for subprocess spawn + mcp startup

  it('detects new file added between baseline and working tree', async () => {
    // Scan + baseline before adding new file
    const scanResult = spawnSync('node', [binPath, 'scan', '--root', tmpRoot, '--json'], {
      cwd: tmpRoot,
      stdio: 'pipe',
      shell: false,
      encoding: 'utf-8',
    })
    expect(scanResult.status).toBe(0)

    const baselineResult = spawnSync('node', [binPath, 'baseline', '--root', tmpRoot, '--json'], {
      cwd: tmpRoot,
      stdio: 'pipe',
      shell: false,
      encoding: 'utf-8',
    })
    expect(baselineResult.status).toBe(0)

    // Write new file after baseline
    await writeFile(join(tmpRoot, 'src', 'c.ts'), 'export const C = 3\n', 'utf-8')

    const child = spawnCliMcp(tmpRoot)
    try {
      const resp = await sendRequest(child, {
        jsonrpc: '2.0',
        id: 1,
        method: 'tools/call',
        params: {
          name: 'validate_diff',
          arguments: {
            workingFiles: ['src/c.ts'],
            mode: 'advisory',
          },
        },
      })

      expect(resp.result).toBeDefined()
      const mcpResult = resp.result as Record<string, unknown>
      expect(mcpResult.isError).toBeUndefined()

      const parsed = ((mcpResult.structuredContent as Record<string, unknown>) ??
        mcpResult) as Record<string, unknown>

      const graphDelta = parsed.graphDelta as Record<string, unknown>
      expect(graphDelta).toBeDefined()

      const newNodes = graphDelta.newNodes as Array<Record<string, unknown>>
      expect(Array.isArray(newNodes)).toBe(true)

      const newNodeIds = newNodes.map((n) => n.id as string)
      expect(newNodeIds).toContain('file:src/c.ts')
    } finally {
      child.kill()
    }
  }, 120_000) // long timeout for subprocess spawn + mcp startup
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
    process.stderr.write(`[cli-mcp-validate-diff-child] ${chunk}`)
  })
  return child
}
