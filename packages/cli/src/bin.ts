import { defineCommand, runMain } from 'citty'
import { baselineCommand } from './commands/baseline.js'
import { checkCommand } from './commands/check.js'
import { contextCommand } from './commands/context.js'
import { defaultCommand } from './commands/default.js'
import { doctorCommand } from './commands/doctor.js'
import { impactCommand } from './commands/impact.js'
import { initCommand } from './commands/init.js'
import { mcpCommand } from './commands/mcp.js'
import { scanCommand } from './commands/scan.js'
import { statsCommand } from './commands/stats.js'
import { validateDiffCommand } from './commands/validate-diff.js'
import {
  SUBCOMMAND_NAMES,
  findMisplacedRootFlag,
  parseBareArgs,
  shouldRunBareOverview,
} from './first-run/bare-args.js'
import { runFirstRunOverview } from './first-run/run-first-run.js'
import { createCliLogger } from './logger.js'
import { assertNodeVersion } from './node-guard.js'
import { loadVibegraphVersion } from './version.js'

const nodeCheck = assertNodeVersion(process.versions.node, '22.12.0')
if (!nodeCheck.ok) {
  process.stderr.write(`${nodeCheck.message}\n`)
  process.exit(1)
}

// Load version before defining the command so citty's built-in --version works.
const version = await loadVibegraphVersion()

const main = defineCommand({
  meta: {
    name: 'vibe-graph',
    version,
    description:
      'Code architecture cartographer — scan, analyze, and serve project context to AI agents.',
  },
  args: {
    root: { type: 'string', description: 'Project root override (default: cwd)' },
    port: {
      type: 'string',
      description: 'Cockpit HTTP port (default 3099, auto-fallback 3099..3110)',
    },
    'no-open': { type: 'boolean', description: 'Do not open the browser', default: false },
    rescan: {
      type: 'boolean',
      description: 'Force re-scan before the overview/cockpit',
      default: false,
    },
    cockpit: {
      type: 'boolean',
      description: 'Skip the overview and launch the cockpit directly',
      default: false,
    },
    json: { type: 'boolean', description: 'Output raw JSON (machine-readable)', default: false },
    quiet: { type: 'boolean', description: 'Print only a one-line summary', default: false },
  },
  subCommands: {
    init: initCommand,
    scan: scanCommand,
    baseline: baselineCommand,
    check: checkCommand,
    mcp: mcpCommand,
    doctor: doctorCommand,
    context: contextCommand,
    impact: impactCommand,
    stats: statsCommand,
    'validate-diff': validateDiffCommand,
    // `cockpit` is the preferred name; bare `vibe-graph` shows the overview then
    // offers the cockpit. `default` is kept as a legacy alias of the launcher.
    default: defaultCommand,
    cockpit: defaultCommand,
  },
  async run({ rawArgs }) {
    // Bare invocations are handled before runMain (see bottom of file), so run()
    // is only reached when citty dispatched a subcommand — and citty fires the
    // root run() AFTER the subcommand completes. This guard returns so we don't
    // append overview/banner output to a subcommand's output.
    if (rawArgs.some((arg) => !arg.startsWith('-') && SUBCOMMAND_NAMES.has(arg))) {
      return
    }
  },
})

const rawArgv = process.argv.slice(2)
if (shouldRunBareOverview(rawArgv)) {
  const bare = parseBareArgs(rawArgv)
  const log = createCliLogger({ json: bare.json, quiet: bare.quiet, destination: process.stderr })
  if (bare.portError) {
    log.error('--port must be a positive integer 1..65535')
    process.exitCode = 1
  } else {
    await runFirstRunOverview({
      root: bare.root,
      ...(bare.port !== undefined ? { port: bare.port, explicitPort: true } : {}),
      noOpen: bare.noOpen,
      rescan: bare.rescan,
      cockpit: bare.cockpit,
      json: bare.json,
      quiet: bare.quiet,
      log,
    })
  }
} else {
  // A root-level `--root` before a subcommand is dropped by citty, and the command
  // then resolves the project root by walking UP from cwd — silently answering about
  // a different project. Refuse instead of guessing: a confidently wrong answer is
  // the most expensive failure mode for an evidence-based tool.
  const misplacedRoot = findMisplacedRootFlag(rawArgv)
  if (misplacedRoot) {
    process.stderr.write(
      `vibe-graph: \`${misplacedRoot.flag}\` was passed before the subcommand, where it is ignored.
Without it, \`${misplacedRoot.subcommand}\` resolves the project root by walking up from the
current directory, which may be an entirely different project.

Put it after the subcommand:
  vibe-graph ${misplacedRoot.subcommand} ${misplacedRoot.flag}${
    misplacedRoot.value === undefined ? '' : ` ${misplacedRoot.value}`
  }
`,
    )
    process.exit(1)
  }
  await runMain(main)
}
