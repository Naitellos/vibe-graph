import { resolveProjectRoot } from '@codearch/core'
import { defineCommand } from 'citty'
import { INTEGRATION_CHECKS } from '../doctor/integrations.js'
import { PROJECT_CHECKS } from '../doctor/project.js'
import { runChecks } from '../doctor/registry.js'
import { SYSTEM_CHECKS } from '../doctor/system.js'
import { createCliLogger } from '../logger.js'

const ALL_CHECKS = [...SYSTEM_CHECKS, ...PROJECT_CHECKS, ...INTEGRATION_CHECKS]

export const doctorCommand = defineCommand({
  meta: {
    name: 'doctor',
    description: 'Run environment + project sanity checks',
  },
  args: {
    json: { type: 'boolean', description: 'Output raw JSON (machine-readable)', default: false },
    quiet: { type: 'boolean', description: 'Suppress info-level logs', default: false },
  },
  async run({ args }) {
    const log = createCliLogger({ json: args.json, quiet: args.quiet })
    const projectRoot = await resolveProjectRoot({ explicit: undefined, cwd: process.cwd() })

    const results = await runChecks({
      checks: ALL_CHECKS,
      ctx: { projectRoot },
    })

    let anyError = false
    for (const r of results) {
      if (r.status === 'error') anyError = true
      const data = r.suggestion !== undefined ? { suggestion: r.suggestion } : {}
      switch (r.status) {
        case 'ok':
          log.info({ check: r.id, ...data }, `✓ ${r.message}`)
          break
        case 'info':
          log.info({ check: r.id, ...data }, `ℹ ${r.message}`)
          break
        case 'warn':
          log.warn({ check: r.id, ...data }, `⚠ ${r.message}`)
          break
        case 'error':
          log.error({ check: r.id, ...data }, `✗ ${r.message}`)
          break
      }
    }

    if (anyError) {
      process.exitCode = 1
    }
  },
})
