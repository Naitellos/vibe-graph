import { resolve } from 'node:path'
import { createSnapshotReader, resolveProjectRoot, scan, writeSnapshotAtomic } from '@codearch/core'
import { startMcpServer } from '@codearch/mcp'
import { defineCommand } from 'citty'
import { createCliLogger } from '../logger.js'

export function pickExplicitRoot(flag?: string, env?: string): string | undefined {
  const f = flag?.trim()
  if (f) return f
  const e = env?.trim()
  if (e) return e
  return undefined
}

export const mcpCommand = defineCommand({
  meta: {
    name: 'mcp',
    description: 'Start the MCP server over stdio (for Claude Code / Cursor)',
  },
  args: {
    'project-root': {
      type: 'string',
      // `--root` is the spec §5.2 name; `--project-root` is kept as the
      // canonical key for back-compat with existing tooling/tests.
      alias: 'root',
      description: 'Project root override (alias: --root; default: cwd)',
    },
    json: { type: 'boolean', default: false },
    quiet: { type: 'boolean', default: false },
    'auto-scan': {
      type: 'boolean',
      description: 'Auto-scan when graph.json is missing/stale (default true)',
      default: true,
    },
  },
  async run({ args }) {
    // In MCP stdio mode, STDOUT is the JSON-RPC channel — logger MUST NOT write
    // there. Route all log output to stderr explicitly.
    const log = createCliLogger({ json: args.json, quiet: args.quiet, destination: process.stderr })

    const explicitRoot = pickExplicitRoot(
      typeof args['project-root'] === 'string' ? args['project-root'] : undefined,
      process.env.VIBEGRAPH_ROOT,
    )
    const projectRoot = await resolveProjectRoot({
      explicit: explicitRoot,
      cwd: process.cwd(),
    })
    const snapshotPath = resolve(projectRoot, '.vibegraph/cache/graph.json')

    log.info({ projectRoot, snapshotPath, autoScan: args['auto-scan'] }, 'mcp: starting')

    const reader = createSnapshotReader({
      snapshotPath,
      autoScanOnMissing: args['auto-scan'],
      ...(args['auto-scan']
        ? {
            triggerScan: async () => {
              const snap = await scan({ root: projectRoot })
              await writeSnapshotAtomic(snapshotPath, snap)
            },
          }
        : {}),
    })

    await startMcpServer({ reader, projectRoot })
  },
})
