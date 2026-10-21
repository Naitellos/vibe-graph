// test/e2e/cli-mcp-rule-violation.test.ts
//
// E2E smoke test for `vibe-graph mcp` validate_diff rule violation gate.
//
// Setup:
// 1. Copy fixtures/synthetic/rules-cases/edge-pattern-violation to tmpdir
// 2. Run `vibe-graph scan` + `vibe-graph baseline` with no violation present
// 3. Introduce the violating import (src/domain/foo.ts → src/ui/bar.ts)
// 4. Re-scan so the working graph contains the new edge
// 5. Spawn `vibe-graph mcp` over stdio
// 6. Call validate_diff with the changed file listed in workingFiles
// 7. Assert status='violation', newViolations contains ruleId='builtin:no-layer-violation'

import { type ChildProcessWithoutNullStreams, spawn, spawnSync } from 'node:child_process'
import { cpSync, existsSync, mkdtempSync, realpathSync } from 'node:fs'
import { rm, writeFile } from 'node:fs/promises'
import { tmpdir } from 'node:os'
import { dirname, join, resolve } from 'node:path'
import { fileURLToPath } from 'node:url'
import { afterEach, beforeEach, describe, expect, it } from 'vitest'

import { sendRequest } from './helpers/jsonrpc.js'

// Note: build is handled in test/e2e/global-setup.ts

const __dirname = dirname(fileURLToPath(import.meta.url))
const repoRoot = resolve(__dirname, '../..')
const binPath = join(repoRoot, 'packages/cli/dist/bin.js')
const fixtureSrc = join(repoRoot, 'fixtures/synthetic/rules-cases/edge-pattern-violation')

describe('vibe-graph mcp validate_diff rule violation (E2E)', () => {
  let tmpRoot: string

  beforeEach(() => {
    // Copy fixture to tmp so we don't pollute the source tree
    tmpRoot = realpathSync(mkdtempSync(join(tmpdir(), 'vg-e2e-rv-')))
    cpSync(fixtureSrc, tmpRoot, { recursive: true })
  })

  afterEach(async () => {
    if (tmpRoot !== undefined && existsSync(tmpRoot)) {
      await rm(tmpRoot, { recursive: true, force: true })
    }
  })

  it('catches domain→horizontal import via validate_diff', async () => {
    // 1. Scan + baseline with no violation present
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

    // 2. Introduce the violating import into the working tree
    await writeFile(
      join(tmpRoot, 'src', 'domain', 'foo.ts'),
      "import { bar } from '../ui/bar.js'\nexport const foo = bar + ' from domain'\n",
      'utf-8',
    )

    // 3. Re-scan so the working graph contains the new forbidden edge
    const reScanResult = spawnSync('node', [binPath, 'scan', '--root', tmpRoot, '--json'], {
      cwd: tmpRoot,
      stdio: 'pipe',
      shell: false,
      encoding: 'utf-8',
    })
    expect(reScanResult.status).toBe(0)

    // 4. Spawn vibe-graph mcp and call validate_diff via stdio
    const child = spawnCliMcp(tmpRoot)
    try {
      const resp = await sendRequest(child, {
        jsonrpc: '2.0',
        id: 1,
        method: 'tools/call',
        params: {
          name: 'validate_diff',
          arguments: {
            // Pass the changed file explicitly so git is not consulted
            workingFiles: ['src/domain/foo.ts'],
            mode: 'enforce',
          },
        },
      })

      // 5. Assert: status=violation with the rule finding
      expect(resp.result).toBeDefined()
      const mcpResult = resp.result as Record<string, unknown>
      expect(mcpResult.isError).toBeUndefined()

      const result = ((mcpResult.structuredContent as Record<string, unknown>) ??
        mcpResult) as Record<string, unknown>

      expect(result.status).toBe('violation')

      const newViolations = result.newViolations as Array<Record<string, unknown>>
      expect(Array.isArray(newViolations)).toBe(true)
      expect(newViolations.length).toBeGreaterThanOrEqual(1)

      const violation = newViolations[0]
      expect(violation.domain).toBe('rule')
      const metadata = violation.metadata as Record<string, unknown>
      expect(metadata.ruleId).toBe('builtin:no-layer-violation')
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
    process.stderr.write(`[cli-mcp-rule-violation-child] ${chunk}`)
  })
  return child
}
