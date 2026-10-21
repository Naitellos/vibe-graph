// test/e2e/cli-mcp-root-flag.test.ts
//
// Asserts that `vibe-graph mcp` honors an explicit project-root flag
// INDEPENDENTLY of cwd. The server is spawned from an unrelated temp dir, so
// the only thing that can point it at the fixture is the explicit flag.
//
// Spec §5.2 names the flag `--root`; the implementation historically only
// accepted `--project-root`. Both must work (the latter is used by the other
// e2e tests and `--root` is what `.mcp.json` / the spec use).

import { type ChildProcessWithoutNullStreams, spawn } from 'node:child_process'
import { mkdtempSync, realpathSync } from 'node:fs'
import { tmpdir } from 'node:os'
import { dirname, join, resolve } from 'node:path'
import { fileURLToPath } from 'node:url'
import { describe, expect, it } from 'vitest'

// Note: build is handled in test/e2e/global-setup.ts

const __dirname = dirname(fileURLToPath(import.meta.url))
const repoRoot = resolve(__dirname, '../..')
const fixtureRoot = join(repoRoot, 'fixtures/synthetic/simple-cycle')
const binPath = join(repoRoot, 'packages/cli/dist/bin.js')

/**
 * Spawn `vibe-graph mcp <flag> <fixtureRoot> --json` from an unrelated cwd and
 * resolve with the `projectRoot` the server reports in its startup log line.
 */
function resolvedRootFor(flag: '--root' | '--project-root'): Promise<string> {
  return new Promise((resolvePromise, reject) => {
    const unrelatedCwd = mkdtempSync(join(tmpdir(), 'vg-root-flag-'))
    const child: ChildProcessWithoutNullStreams = spawn(
      'node',
      [binPath, 'mcp', flag, fixtureRoot, '--json'],
      { cwd: unrelatedCwd, stdio: ['pipe', 'pipe', 'pipe'], shell: false },
    )

    let buf = ''
    let settled = false
    const finish = (fn: () => void) => {
      if (settled) return
      settled = true
      clearTimeout(timer)
      child.kill()
      fn()
    }
    const timer = setTimeout(
      () => finish(() => reject(new Error(`timeout waiting for startup; stderr so far:\n${buf}`))),
      30_000,
    )

    child.stderr.on('data', (chunk: Buffer) => {
      buf += chunk.toString()
      let nl = buf.indexOf('\n')
      while (nl !== -1) {
        const line = buf.slice(0, nl).trim()
        buf = buf.slice(nl + 1)
        if (line) {
          try {
            const rec = JSON.parse(line) as { msg?: string; projectRoot?: string }
            if (rec.msg === 'mcp: starting' && typeof rec.projectRoot === 'string') {
              finish(() => resolvePromise(rec.projectRoot as string))
              return
            }
          } catch {
            // non-JSON line (shouldn't happen with --json) — ignore
          }
        }
        nl = buf.indexOf('\n')
      }
    })
    child.on('error', (e) => finish(() => reject(e)))
  })
}

describe('vibe-graph mcp — explicit project-root flag (E2E)', () => {
  const expected = realpathSync(fixtureRoot)

  it('honors --project-root', async () => {
    expect(await resolvedRootFor('--project-root')).toBe(expected)
  }, 60_000)

  it('honors --root (spec §5.2)', async () => {
    expect(await resolvedRootFor('--root')).toBe(expected)
  }, 60_000)
})
