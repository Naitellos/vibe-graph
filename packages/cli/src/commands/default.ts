import { resolveProjectRoot } from '@codearch/core'
import { defineCommand } from 'citty'
import { createCliLogger } from '../logger.js'
import { startCockpit } from '../server/cockpit.js'

export const defaultCommand = defineCommand({
  meta: {
    name: 'default',
    description: 'Launch the Vibe Graph cockpit (HTTP + WebSocket + UI)',
  },
  args: {
    root: { type: 'string', description: 'Project root override (default: cwd)' },
    port: { type: 'string', description: 'HTTP port (default 3099, auto-fallback 3099..3110)' },
    'no-open': { type: 'boolean', description: 'Do not open browser', default: false },
    rescan: { type: 'boolean', description: 'Force re-scan before serving', default: false },
    json: { type: 'boolean', default: false },
    quiet: { type: 'boolean', default: false },
  },
  async run({ args }) {
    const log = createCliLogger({ json: args.json, quiet: args.quiet })

    const explicitRoot = typeof args.root === 'string' ? args.root : undefined
    const projectRoot = await resolveProjectRoot({
      explicit: explicitRoot,
      cwd: process.cwd(),
    })

    // Parse --port
    let port: number | undefined
    let explicitPort = false
    if (typeof args.port === 'string' && args.port.length > 0) {
      const n = Number(args.port)
      if (!Number.isInteger(n) || n <= 0 || n > 65535) {
        log.error({ port: args.port }, 'default: --port must be a positive integer 1..65535')
        process.exitCode = 1
        return
      }
      port = n
      explicitPort = true
    }

    const handle = await startCockpit({
      projectRoot,
      ...(port !== undefined ? { port, explicitPort } : {}),
      noOpen: args['no-open'],
      rescan: args.rescan,
      log,
    })

    // Wire SIGINT for clean shutdown
    process.on('SIGINT', () => {
      log.info('cockpit: shutting down')
      void handle.stop().then(() => process.exit(0))
    })
    process.on('SIGTERM', () => {
      log.info('cockpit: shutting down')
      void handle.stop().then(() => process.exit(0))
    })

    // Keep the process alive — HTTP server's `listen` already does, but explicit await for clarity
    await new Promise<void>(() => {})
  },
})
