import { confirm, intro, isCancel, log, outro } from '@clack/prompts'
import { resolveProjectRoot } from '@codearch/core'
import { defineCommand } from 'citty'
import { type InitPrompts, runInit, yesPrompts } from '../init/orchestrator.js'
import { createCliLogger } from '../logger.js'

export const initCommand = defineCommand({
  meta: {
    name: 'init',
    description: 'Initialize Vibe Graph in the current project (config, ignore, MCP setup)',
  },
  args: {
    yes: { type: 'boolean', description: 'Skip prompts; accept all defaults', default: false },
    force: {
      type: 'boolean',
      description: 'Overwrite existing config without confirming',
      default: false,
    },
    hooks: {
      type: 'boolean',
      description: 'Also merge a Vibe Graph PostToolUse hook into .claude/settings.json',
      default: false,
    },
    hooksOnly: {
      type: 'boolean',
      alias: 'hooks-only',
      description:
        'Only (re)install the PostToolUse hook into .claude/settings.json — ' +
        'non-destructive: skips config/ignore/MCP. Safe on an initialized repo.',
      default: false,
    },
    json: { type: 'boolean', default: false },
    quiet: { type: 'boolean', default: false },
  },
  async run({ args }) {
    const cliLog = createCliLogger({ json: args.json, quiet: args.quiet })
    const projectRoot = await resolveProjectRoot({ explicit: undefined, cwd: process.cwd() })

    intro('vibe-graph init')

    const prompts: InitPrompts = args.yes
      ? yesPrompts
      : {
          async confirmOverwrite() {
            const result = await confirm({
              message: '.vibegraph/ exists — overwrite?',
              initialValue: false,
            })
            return !isCancel(result) && result === true
          },
          async confirmMcpConfig({ ide }) {
            const result = await confirm({
              message: `Add MCP config for ${ide}?`,
              initialValue: true,
            })
            return !isCancel(result) && result === true
          },
          log: (msg: string) => log.info(msg),
          warn: (msg: string) => log.warn(msg),
          success: (msg: string) => log.success(msg),
        }

    const result = await runInit({
      projectRoot,
      yes: args.yes,
      force: args.force,
      hooks: args.hooks,
      hooksOnly: args.hooksOnly,
      prompts,
    })

    if (result.status === 'aborted') {
      outro(`Aborted: ${result.abortReason}`)
      cliLog.error({ reason: result.abortReason }, 'init aborted')
      process.exitCode = 1
      return
    }

    outro(`Project '${result.projectName}' initialized`)
    cliLog.info(
      {
        projectName: result.projectName,
        stack: result.stack,
        ides: result.detectedIdes,
        stepCount: result.steps.length,
      },
      'init complete',
    )
  },
})
