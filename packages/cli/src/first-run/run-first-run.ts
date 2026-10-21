import { confirm, isCancel } from '@clack/prompts'
import { buildOverview, resolveProjectRoot } from '@codearch/core'
import type { Logger } from 'pino'
import { startCockpit } from '../server/cockpit.js'
import { loadOrScanOverviewSnapshot } from './load-or-scan.js'
import { renderOneLineSummary, renderOverview } from './render-overview.js'

export interface FirstRunArgs {
  root?: string
  port?: number
  explicitPort?: boolean
  noOpen: boolean
  rescan: boolean
  cockpit: boolean
  json: boolean
  quiet: boolean
  log: Logger
}

export async function runFirstRunOverview(args: FirstRunArgs): Promise<void> {
  const projectRoot = await resolveProjectRoot({ explicit: args.root, cwd: process.cwd() })

  // --cockpit: skip the overview, launch straight into the UI (preserves prior behavior).
  if (args.cockpit) {
    await launchCockpit(projectRoot, args)
    return
  }

  let overview: ReturnType<typeof buildOverview>
  try {
    const loaded = await loadOrScanOverviewSnapshot({
      projectRoot,
      rescan: args.rescan,
      log: args.log,
    })
    overview = buildOverview(loaded)
  } catch (err) {
    // First run must not crash with a stack trace — surface a friendly message.
    args.log.error(
      { error: (err as Error).message },
      'Could not build the overview. Try `vibe-graph scan`, or check .vibegraph/.',
    )
    process.exitCode = 1
    return
  }

  if (args.json) {
    process.stdout.write(`${JSON.stringify(overview)}\n`)
    return
  }
  if (args.quiet) {
    process.stdout.write(`${renderOneLineSummary(overview)}\n`)
    return
  }

  process.stdout.write(`${renderOverview(overview)}\n`)

  // Prompt only in an interactive terminal; never block a pipe/CI.
  if (process.stdin.isTTY && process.stdout.isTTY) {
    const open = await confirm({ message: 'Open the interactive cockpit?', initialValue: true })
    if (!isCancel(open) && open === true) {
      await launchCockpit(projectRoot, args)
    }
  }
}

async function launchCockpit(projectRoot: string, args: FirstRunArgs): Promise<void> {
  const handle = await startCockpit({
    projectRoot,
    ...(args.port !== undefined
      ? { port: args.port, explicitPort: args.explicitPort ?? true }
      : {}),
    noOpen: args.noOpen,
    rescan: args.rescan,
    log: args.log,
  })
  process.on('SIGINT', () => void handle.stop().then(() => process.exit(0)))
  process.on('SIGTERM', () => void handle.stop().then(() => process.exit(0)))
  await new Promise<void>(() => {})
}
