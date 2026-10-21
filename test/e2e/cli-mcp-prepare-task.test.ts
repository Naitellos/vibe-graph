// test/e2e/cli-mcp-prepare-task.test.ts
//
// E2E smoke test for `vibe-graph mcp` prepare_task tool.
//
// Setup:
// 1. Create a minimal project in tmpdir with config.yml + one source file
// 2. Run `vibe-graph scan` to populate snapshot
// 3. Run `vibe-graph baseline` to write baseline.json
// 4. Spawn `vibe-graph mcp` over stdio
// 5. Send tools/call request with prepare_task (happy path + NO_MATCHING_SUBSYSTEM)
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

describe('vibe-graph mcp prepare_task (E2E)', () => {
  let tmpRoot: string

  beforeEach(async () => {
    tmpRoot = join(tmpdir(), `vg-e2e-pt-${Date.now()}-${Math.floor(Math.random() * 1e9)}`)
    await mkdir(join(tmpRoot, 'src', 'alpha'), { recursive: true })
    await mkdir(join(tmpRoot, '.vibegraph', 'cache'), { recursive: true })
    await writeFile(join(tmpRoot, 'package.json'), '{"name":"e2e-pt","version":"0.0.0"}\n')
    await writeFile(
      join(tmpRoot, '.vibegraph', 'config.yml'),
      [
        'project:',
        '  name: e2e-pt',
        '  root: .',
        'subsystemDetection:',
        '  mode: manual',
        'subsystems:',
        '  - id: alpha',
        '    title: Alpha',
        '    layer: domain',
        '    match: ["src/alpha/**"]',
        '',
      ].join('\n'),
      'utf-8',
    )
    await writeFile(join(tmpRoot, 'src', 'alpha', 'a.ts'), 'export const A = 1\n', 'utf-8')
  })

  afterEach(async () => {
    if (tmpRoot !== undefined && existsSync(tmpRoot)) {
      await rm(tmpRoot, { recursive: true, force: true })
    }
  })

  it('returns prepare_task output for a valid intent + path', async () => {
    // Pre-condition: scan to populate snapshot
    const scanResult = spawnSync('node', [binPath, 'scan', '--root', tmpRoot, '--json'], {
      cwd: tmpRoot,
      stdio: 'pipe',
      shell: false,
      encoding: 'utf-8',
    })
    expect(scanResult.status).toBe(0)

    // Write baseline from the real scan snapshot so prepare_task has a valid snapshotId
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
          name: 'prepare_task',
          arguments: {
            intent: 'extend alpha module',
            paths: ['src/alpha/a.ts'],
            mode: 'feature',
          },
        },
      })

      expect(resp.result).toBeDefined()
      const mcpResult = resp.result as Record<string, unknown>
      const parsed = ((mcpResult.structuredContent as Record<string, unknown>) ??
        mcpResult) as Record<string, unknown>

      expect(parsed.taskId).toBeDefined()
      expect(typeof parsed.taskId).toBe('string')
      expect(parsed.taskId as string).toMatch(/^task_/)

      const target = parsed.target as Record<string, unknown>
      expect(target).toBeDefined()
      expect(Array.isArray(target.subsystems)).toBe(true)
      expect(target.subsystems as string[]).toContain('alpha')

      // Default built-in rules are globally applicable — rules must be non-empty.
      expect(Array.isArray(parsed.rules)).toBe(true)
      const rules = parsed.rules as Array<Record<string, unknown>>
      expect(rules.length).toBeGreaterThanOrEqual(3)
      expect(rules.some((r) => r.id === 'builtin:no-layer-violation')).toBe(true)

      // doNotDo is populated from forbidding rules
      expect(Array.isArray(parsed.doNotDo)).toBe(true)
      const doNotDo = parsed.doNotDo as string[]
      expect(doNotDo.length).toBeGreaterThanOrEqual(1)
      expect(doNotDo.some((d) => d.includes('builtin:no-layer-violation'))).toBe(true)
      expect(typeof parsed.summary).toBe('string')
    } finally {
      child.kill()
    }
  }, 120_000) // long timeout for subprocess spawn + mcp startup

  it('returns isError with NO_MATCHING_SUBSYSTEM for unrelated paths', async () => {
    // Pre-condition: scan to populate snapshot (baseline not required for error path)
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
          name: 'prepare_task',
          arguments: {
            intent: 'change something',
            paths: ['totally/unrelated.ts'],
            mode: 'refactor',
          },
        },
      })

      expect(resp.result).toBeDefined()
      const mcpResult = resp.result as Record<string, unknown>
      expect(mcpResult.isError).toBe(true)

      const sc = (mcpResult.structuredContent as Record<string, unknown>) ?? {}
      const err = sc.error as Record<string, unknown>
      expect(err).toBeDefined()
      expect(err.code).toBe('TARGET_NOT_FOUND')
      expect(err.message as string).toMatch(/NO_MATCHING_SUBSYSTEM/)
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
    process.stderr.write(`[cli-mcp-prepare-task-child] ${chunk}`)
  })
  return child
}
