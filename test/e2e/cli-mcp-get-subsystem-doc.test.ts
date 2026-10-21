// test/e2e/cli-mcp-get-subsystem-doc.test.ts
//
// E2E smoke test for `vibe-graph mcp` get_subsystem_doc tool.
//
// Setup:
// 1. Copy rich-yaml fixture to tmpdir
// 2. Run `vibe-graph scan` to populate snapshot
// 3. Spawn `vibe-graph mcp` over stdio
// 4. Send tools/call request with get_subsystem_doc for payments
// 5. Assert response structure and key fields

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

describe('vibe-graph mcp get_subsystem_doc (E2E)', () => {
  let workDir: string

  beforeAll(() => {
    // Copy fixture to tmp so we don't pollute the source tree
    workDir = realpathSync(mkdtempSync(join(tmpdir(), 'vg-e2e-mcp-doc-')))
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

  it('returns subsystem doc with rich metadata for payments', async () => {
    const child = spawnCliMcp(workDir)
    try {
      const resp = await sendRequest(child, {
        jsonrpc: '2.0',
        id: 1,
        method: 'tools/call',
        params: {
          name: 'get_subsystem_doc',
          arguments: { slug: 'payments' },
        },
      })

      expect(resp.result).toBeDefined()
      const result = resp.result as Record<string, unknown>
      const doc = (result.structuredContent as Record<string, unknown>) ?? result

      // Core fields from yaml declaration
      expect(doc.id).toBe('payments')
      expect(doc.title).toBe('Payments')
      expect(doc.layer).toBe('domain')
      expect(doc.status).toBe('shipped')
      expect(typeof doc.description).toBe('string')
      expect((doc.description as string).length).toBeGreaterThan(0)

      // Verification metadata
      expect(doc.lastVerified).toBe('2026-05-26')
      expect(doc.verifiedBy).toBe('claude-sonnet-4-7')

      // Match patterns
      expect(Array.isArray(doc.match)).toBe(true)
      expect((doc.match as string[]).length).toBeGreaterThan(0)

      // Declared relationships
      expect(Array.isArray(doc.declaredDependsOn)).toBe(true)
      expect((doc.declaredDependsOn as string[]).includes('auth')).toBe(true)
      expect(Array.isArray(doc.declaredConsumedBy)).toBe(true)
      expect((doc.declaredConsumedBy as string[]).includes('dashboard')).toBe(true)

      // AST-derived relationships
      expect(Array.isArray(doc.astDependsOn)).toBe(true)
      expect(Array.isArray(doc.astConsumedBy)).toBe(true)

      // File ownership
      expect(typeof doc.ownedFilesCount).toBe('number')
      expect(doc.ownedFilesCount as number).toBeGreaterThanOrEqual(0)

      // Schema tables
      expect(Array.isArray(doc.schemaTables)).toBe(true)
      expect((doc.schemaTables as string[]).includes('payment_transactions')).toBe(true)
      expect((doc.schemaTables as string[]).includes('subscription_plans')).toBe(true)

      // Related artifacts
      expect(Array.isArray(doc.relatedSpecs)).toBe(true)
      expect((doc.relatedSpecs as string[]).length).toBeGreaterThan(0)
      expect(Array.isArray(doc.relatedDecisions)).toBe(true)
      expect((doc.relatedDecisions as string[]).length).toBeGreaterThan(0)

      // Memory references
      expect(Array.isArray(doc.memoryRefs)).toBe(true)

      // Drift summary
      expect(doc.driftSummary).toBeDefined()
      const driftSummary = doc.driftSummary as Record<string, unknown>
      expect(typeof driftSummary.open).toBe('number')
      expect(typeof driftSummary.accepted).toBe('number')
      expect(typeof driftSummary.ignored).toBe('number')
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
    process.stderr.write(`[cli-mcp-get-subsystem-doc-child] ${chunk}`)
  })
  return child
}
