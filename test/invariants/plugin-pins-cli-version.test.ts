/**
 * Invariant: the Claude Code plugin runs exactly the CLI version this repo releases.
 *
 * The plugin's hook and MCP server start the CLI through `npx`. Unpinned,
 * `npx -y @codearch/cli` resolves to whatever npm or the local npx cache hands
 * back, so a user could keep running a stale release (0.1.2 nudged every repo on
 * every edit long after the fix existed). Pinning to the version in
 * packages/cli/package.json means `changeset version` bumping the CLI fails this
 * test until the plugin pin is bumped in the same release PR.
 */
import { readFileSync } from 'node:fs'
import { dirname, join } from 'node:path'
import { fileURLToPath } from 'node:url'
import { describe, expect, it } from 'vitest'

const __dirname = dirname(fileURLToPath(import.meta.url))
const REPO_ROOT = join(__dirname, '../..')
const PLUGIN_ROOT = join(REPO_ROOT, 'packages/plugin')

function readJson<T>(path: string): T {
  return JSON.parse(readFileSync(path, 'utf-8')) as T
}

const cliVersion = readJson<{ version: string }>(
  join(REPO_ROOT, 'packages/cli/package.json'),
).version
const pinned = `@codearch/cli@${cliVersion}`

describe('invariant: the plugin pins the released CLI version', () => {
  it('the PostToolUse hook runs the pinned CLI', () => {
    const hooks = readJson<{
      hooks: Record<string, Array<{ hooks: Array<{ command: string }> }>>
    }>(join(PLUGIN_ROOT, 'hooks/hooks.json'))
    const commands = Object.values(hooks.hooks)
      .flat()
      .flatMap((entry) => entry.hooks.map((h) => h.command))
    expect(commands.length).toBeGreaterThan(0)
    for (const command of commands) {
      expect(command).toContain(`npx -y ${pinned} `)
    }
  })

  it('the MCP server runs the pinned CLI', () => {
    const mcp = readJson<{ mcpServers: Record<string, { command: string; args: string[] }> }>(
      join(PLUGIN_ROOT, '.mcp.json'),
    )
    const servers = Object.values(mcp.mcpServers)
    expect(servers.length).toBeGreaterThan(0)
    for (const server of servers) {
      expect(server.command).toBe('npx')
      expect(server.args).toContain(pinned)
    }
  })
})
