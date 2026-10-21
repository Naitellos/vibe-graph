// test/e2e/cli-mcp-validate-drift.test.ts
//
// E2E smoke test for `vibe-graph mcp` validate_drift tool.
//
// Setup:
// 1. Copy rich-yaml fixture to tmpdir
// 2. Run `vibe-graph scan` to populate snapshot
// 3. Spawn `vibe-graph mcp` over stdio
// 4. Send tools/call request with validate_drift (unfiltered and filtered by slug)
// 5. Assert response structure and filtering works

import { type ChildProcessWithoutNullStreams, spawn, spawnSync } from 'node:child_process'
import { cpSync, existsSync, mkdtempSync, realpathSync } from 'node:fs'
import { rm } from 'node:fs/promises'
import { tmpdir } from 'node:os'
import { dirname, join, resolve } from 'node:path'
import { fileURLToPath } from 'node:url'
import { afterAll, beforeAll, describe, expect, it } from 'vitest'

import { sendRequest } from './helpers/jsonrpc.js'

// Note: build is handled in test/e2e/global-setup.ts

const __dirname = dirname(fileURLToPath(import.meta.url))
const repoRoot = resolve(__dirname, '../..')
const binPath = join(repoRoot, 'packages/cli/dist/bin.js')
const fixtureSrc = join(repoRoot, 'fixtures/synthetic/rich-yaml')

describe('vibe-graph mcp validate_drift (E2E)', () => {
  let workDir: string

  beforeAll(() => {
    // Copy fixture to tmp so we don't pollute the source tree
    workDir = realpathSync(mkdtempSync(join(tmpdir(), 'vg-e2e-mcp-drift-')))
    cpSync(fixtureSrc, workDir, { recursive: true })

    // Run scan to populate snapshot
    const scanResult = spawnSync('node', [binPath, 'scan', '--json', '--root', workDir], {
      cwd: workDir,
      stdio: 'pipe',
      shell: false,
      encoding: 'utf-8',
      env: { ...process.env, NODE_ENV: 'production' },
    })
    expect(scanResult.status).toBe(0)
  })

  afterAll(async () => {
    if (workDir !== undefined && existsSync(workDir)) {
      await rm(workDir, { recursive: true, force: true })
    }
  })

  it('returns drift findings with summary and categorized arrays', async () => {
    const child = spawnCliMcp(workDir)
    try {
      const resp = await sendRequest(child, {
        jsonrpc: '2.0',
        id: 1,
        method: 'tools/call',
        params: {
          name: 'validate_drift',
          arguments: {},
        },
      })

      expect(resp.result).toBeDefined()
      const mcp_result = resp.result as Record<string, unknown>
      const result = (mcp_result.structuredContent as Record<string, unknown>) ?? mcp_result

      // Response structure
      expect(result.summary).toBeDefined()
      expect(result.stale).toBeDefined()
      expect(result.undeclared).toBeDefined()
      expect(result.unowned).toBeDefined()

      // Summary is an object with counts
      const summary = result.summary as Record<string, unknown>
      expect(typeof summary.total).toBe('number')
      expect(typeof summary.stale).toBe('number')
      expect(typeof summary.undeclared).toBe('number')
      expect(typeof summary.unowned).toBe('number')

      // Count consistency
      const total =
        (summary.stale as number) + (summary.undeclared as number) + (summary.unowned as number)
      expect(summary.total).toBe(total)

      // Finding arrays
      expect(Array.isArray(result.stale)).toBe(true)
      expect(Array.isArray(result.undeclared)).toBe(true)
      expect(Array.isArray(result.unowned)).toBe(true)

      // Each array length matches summary
      expect((result.stale as Array<unknown>).length).toBe(summary.stale)
      expect((result.undeclared as Array<unknown>).length).toBe(summary.undeclared)
      expect((result.unowned as Array<unknown>).length).toBe(summary.unowned)

      // Finding structure (if any findings exist)
      if ((result.stale as Array<unknown>).length > 0) {
        const finding = (result.stale as Array<Record<string, unknown>>)[0]
        expect(typeof finding.id).toBe('string')
        expect(typeof finding.title).toBe('string')
        expect(typeof finding.severity).toBe('string')
        expect(typeof finding.status).toBe('string')
        expect(Array.isArray(finding.involvedNodeIds)).toBe(true)
      }
    } finally {
      child.kill()
    }
  }, 120_000) // long timeout for subprocess spawn + mcp startup

  it('filters findings by subsystem slug when provided', async () => {
    const child = spawnCliMcp(workDir)
    try {
      // Request all drift findings
      const respAll = await sendRequest(child, {
        jsonrpc: '2.0',
        id: 1,
        method: 'tools/call',
        params: {
          name: 'validate_drift',
          arguments: {},
        },
      })

      const mcp_resultAll = respAll.result as Record<string, unknown>
      const allResult =
        (mcp_resultAll.structuredContent as Record<string, unknown>) ?? mcp_resultAll
      const allFindings = (allResult.summary as Record<string, unknown>) ?? {}
      const allTotal = (allFindings.total as number) ?? 0

      // Request findings filtered to payments subsystem
      const respFiltered = await sendRequest(child, {
        jsonrpc: '2.0',
        id: 2,
        method: 'tools/call',
        params: {
          name: 'validate_drift',
          arguments: { slug: 'payments' },
        },
      })

      expect(respFiltered.result).toBeDefined()
      const mcp_resultFiltered = respFiltered.result as Record<string, unknown>
      const filteredResult =
        (mcp_resultFiltered.structuredContent as Record<string, unknown>) ?? mcp_resultFiltered
      const filteredSummary = (filteredResult.summary as Record<string, unknown>) ?? {}
      const filteredTotal = (filteredSummary.total as number) ?? 0

      // Filtered count should be <= total count
      expect(filteredTotal).toBeLessThanOrEqual(allTotal)

      // If there are filtered findings, they should only involve payments subsystem
      const staleFindings = filteredResult.stale as Array<Record<string, unknown>>
      const undeclaredFindings = filteredResult.undeclared as Array<Record<string, unknown>>
      const unownedFindings = filteredResult.unowned as Array<Record<string, unknown>>

      for (const finding of [...staleFindings, ...undeclaredFindings, ...unownedFindings]) {
        const involvedNodeIds = finding.involvedNodeIds as string[]
        expect(involvedNodeIds.some((id) => id === 'subsystem:payments')).toBe(true)
      }
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
    process.stderr.write(`[cli-mcp-validate-drift-child] ${chunk}`)
  })
  return child
}
