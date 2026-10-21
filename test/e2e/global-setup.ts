/**
 * Vitest global setup for the `e2e` project.
 *
 * Each E2E test file spawns the built CLI / MCP binaries. Without a shared
 * setup, every test file's `beforeAll` runs `pnpm --filter ... build`
 * independently, and parallel runs race on the dist directory (different
 * tsup processes overwriting each other's outputs mid-flight).
 *
 * Build all consumed packages ONCE here, before any e2e test starts.
 */

import { spawnSync } from 'node:child_process'
import { dirname, resolve } from 'node:path'
import { fileURLToPath } from 'node:url'

const __dirname = dirname(fileURLToPath(import.meta.url))
const repoRoot = resolve(__dirname, '../..')

export default async function setup(): Promise<void> {
  if (process.env.VIBEGRAPH_TEST_SKIP_BUILDS === '1') return

  // Run the root `build` script which orders: core+mcp+ui first, then CLI.
  // This guarantees packages/ui/dist exists before the CLI's tsup onSuccess copies it.
  const result = spawnSync('pnpm', ['build'], {
    cwd: repoRoot,
    stdio: 'pipe',
    shell: false,
    encoding: 'utf-8',
  })
  if (result.status !== 0) {
    throw new Error(
      `e2e global-setup: pnpm build failed (status ${result.status})\n${result.stderr}`,
    )
  }
}
