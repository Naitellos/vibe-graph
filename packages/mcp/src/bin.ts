#!/usr/bin/env node

import { resolve } from 'node:path'
import { createSnapshotReader, resolveProjectRoot, scan, writeSnapshotAtomic } from '@codearch/core'
import { parseBinArgs } from './bin-config.js'
import { startMcpServer } from './server.js'

async function main(): Promise<void> {
  const cfg = parseBinArgs({
    argv: process.argv.slice(2),
    env: process.env as Record<string, string | undefined>,
    cwd: process.cwd(),
  })

  const projectRoot = await resolveProjectRoot({ explicit: cfg.projectRoot, cwd: process.cwd() })
  const snapshotPath = resolve(projectRoot, '.vibegraph/cache/graph.json')

  const reader = createSnapshotReader({
    snapshotPath,
    autoScanOnMissing: cfg.autoScanOnMissing,
    ...(cfg.autoScanOnMissing
      ? {
          triggerScan: async () => {
            const snap = await scan({ root: projectRoot })
            await writeSnapshotAtomic(snapshotPath, snap)
          },
        }
      : {}),
  })

  await startMcpServer({ reader, projectRoot })
}

main().catch((err) => {
  console.error('[vibe-graph mcp] fatal:', err instanceof Error ? err.message : err)
  process.exit(1)
})
