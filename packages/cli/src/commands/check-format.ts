import type { InertRuleWarning } from '@codearch/core'
import type { RunCheckResult } from './check.js'
import { escapeMdCell, mdFooter } from './format-md.js'

export interface FormatOptions {
  json: boolean
  /** Emit a GitHub-PR-comment-ready markdown block. Takes precedence over json. */
  markdown?: boolean
}

export interface FormattedOutput {
  text: string
  exitCode: 0 | 1
}

const CHECK_MARKER = '<!-- vibe-graph-check -->'
const CHECK_HEADER = '## 🔭 Vibe Graph — Architecture Check'

/** Split warnings into truly-inert rules vs dead references (see InertRuleWarning.kind). */
function splitCounts(warnings: InertRuleWarning[]): { inert: number; dead: number } {
  const inert = warnings.filter((w) => w.kind === 'inert').length
  return { inert, dead: warnings.length - inert }
}

/**
 * Human phrase naming the strict-rules failure cause(s). Only truly-inert rules
 * are described as "can never fire" — a dead exclusion/allowance has the
 * opposite effect (the rule fires more broadly / is stricter than intended).
 */
function strictCause(warnings: InertRuleWarning[]): string {
  const { inert, dead } = splitCounts(warnings)
  const parts: string[] = []
  if (inert > 0) parts.push(`${inert} inert rule(s) (can never fire)`)
  if (dead > 0) parts.push(`${dead} dead subsystem reference(s)`)
  return parts.join(' + ')
}

/** Per-warning message, honest about the actual effect of the unknown reference. */
function warningLine(w: InertRuleWarning): string {
  const base = `  ⚠ ${w.ruleId} references unknown subsystem '${w.unknownSubsystem}' (${w.field})`
  if (w.kind === 'dead-reference') {
    const effect = w.field.includes('exclude')
      ? 'exclusion never applies — rule matches more broadly than intended'
      : 'allowance never applies — boundary is stricter than intended'
    return `${base} — ${effect}`
  }
  return `${base} — 0 nodes match; rule is inert`
}

/**
 * Plain-text lines describing unknown-subsystem warnings (inert rules and dead
 * references). Empty array when there are none. Rendered ABOVE the
 * findings/verdict so a "No rule violations" line is never a bare false green.
 */
function inertRulesTextLines(inertRules: InertRuleWarning[]): string[] {
  if (inertRules.length === 0) return []
  const lines = [
    `Rule subsystem warnings (${inertRules.length}) — unknown subsystem ids (likely a typo, or shadowed by .vibegraph/subsystems/*.yml):`,
  ]
  for (const w of inertRules) {
    lines.push(warningLine(w))
  }
  lines.push('')
  return lines
}

/**
 * Trailing plain-text "Summary:" line for the findings-present output, naming
 * the exact exit-1 cause(s): an enforce violation, `--strict-rules` warnings,
 * or both. The pure-enforce wording is kept verbatim for backwards compat.
 */
function summaryLine(
  findingCount: number,
  enforceViolation: boolean,
  strictInertFailure: boolean,
  warnings: InertRuleWarning[],
): string {
  if (enforceViolation && strictInertFailure) {
    return `Summary: enforce violation + ${strictCause(warnings)} (--strict-rules). Exit 1.`
  }
  if (strictInertFailure) {
    return `Summary: ${strictCause(warnings)} (--strict-rules). Exit 1.`
  }
  if (enforceViolation) {
    return 'Summary: enforce-violation triggered. Exit 1.'
  }
  return `Summary: ${findingCount} finding(s), no enforce violations. Exit 0.`
}

export function formatCheckResult(result: RunCheckResult, opts: FormatOptions): FormattedOutput {
  if (opts.markdown) {
    return formatCheckMarkdown(result)
  }

  if (result.status === 'error') {
    if (opts.json) {
      return { text: JSON.stringify({ status: 'error', error: result.error }), exitCode: 1 }
    }
    return { text: `Error: ${result.error}`, exitCode: 1 }
  }

  const inertRules = result.inertRules ?? []

  if (opts.json) {
    return {
      text: JSON.stringify({
        status: 'ok',
        exitCode: result.exitCode,
        findings: result.ruleFindings,
        inertRules,
      }),
      exitCode: result.exitCode,
    }
  }

  const strictInertFailure = result.strictInertFailure ?? false
  // Fallback keeps results constructed without the flag (e.g. legacy callers/tests)
  // reading as an enforce failure when they exit 1 for a non-strict reason.
  const enforceViolation = result.enforceViolation ?? (result.exitCode === 1 && !strictInertFailure)
  const inertLines = inertRulesTextLines(inertRules)

  if (result.ruleFindings.length === 0) {
    const verdict = strictInertFailure
      ? `${strictCause(inertRules)} — failing due to --strict-rules. Exit 1.`
      : 'No rule violations.'
    return { text: [...inertLines, verdict].join('\n'), exitCode: result.exitCode }
  }

  const lines: string[] = [...inertLines, `Rule violations (${result.ruleFindings.length}):`]
  for (const f of result.ruleFindings) {
    const ruleId = (f.metadata?.ruleId as string | undefined) ?? 'unknown'
    const mode = (f.metadata?.mode as string | undefined) ?? 'unknown'
    const sigil = mode === 'enforce' ? '❌' : mode === 'warn' ? '⚠' : '·'
    lines.push(`  ${sigil} ${ruleId} (${f.severity}, ${mode})`)
    lines.push(`     ${f.title}`)
  }
  lines.push('')
  lines.push(
    summaryLine(result.ruleFindings.length, enforceViolation, strictInertFailure, inertRules),
  )
  return { text: lines.join('\n'), exitCode: result.exitCode }
}

/**
 * Markdown block describing unknown-subsystem warnings, ending with a blank
 * line. Empty string when there are none.
 */
function inertRulesMarkdown(inertRules: InertRuleWarning[]): string {
  if (inertRules.length === 0) return ''
  const rows = inertRules.map((w) => {
    const effect = w.kind === 'inert' ? 'rule is inert' : 'dead reference'
    return `> - \`${escapeMdCell(w.ruleId)}\` → unknown subsystem \`${escapeMdCell(w.unknownSubsystem)}\` (${escapeMdCell(w.field)}) — ${effect}`
  })
  const noun = inertRules.length === 1 ? 'warning' : 'warnings'
  return (
    `> ⚠️ **${inertRules.length} rule subsystem ${noun}** — unknown subsystem ids ` +
    `(likely a typo, or shadowed by \`.vibegraph/subsystems/*.yml\`):\n${rows.join('\n')}\n\n`
  )
}

/** The markdown verdict line, naming the exact exit-1 cause(s). */
function markdownVerdict(
  findingCount: number,
  enforceViolation: boolean,
  strictInertFailure: boolean,
  warnings: InertRuleWarning[],
): string {
  if (enforceViolation && strictInertFailure) {
    return `❌ **Blocking** — enforce violation + ${strictCause(warnings)} (\`--strict-rules\`).`
  }
  if (strictInertFailure) {
    return `❌ **Rule config problem(s)** — ${strictCause(warnings)}; failing due to \`--strict-rules\`.`
  }
  if (enforceViolation) {
    return '❌ **Enforce violation** — this PR introduces a blocking architecture issue.'
  }
  return `⚠️ ${findingCount} advisory finding(s).`
}

function formatCheckMarkdown(result: RunCheckResult): FormattedOutput {
  const footer = mdFooter(CHECK_MARKER)

  if (result.status === 'error') {
    return {
      text: `${CHECK_HEADER}\n\n> ⚠️ ${result.error}\n\n${footer}`,
      exitCode: 1,
    }
  }

  const inertRules = result.inertRules ?? []
  const inertBlock = inertRulesMarkdown(inertRules)
  const strictInertFailure = result.strictInertFailure ?? false
  const enforceViolation = result.enforceViolation ?? (result.exitCode === 1 && !strictInertFailure)

  if (result.ruleFindings.length === 0) {
    const body = strictInertFailure
      ? `❌ **Rule config problem(s)** — ${strictCause(inertRules)}; failing due to \`--strict-rules\`.`
      : '✅ No rule violations.'
    return {
      text: `${CHECK_HEADER}\n\n${inertBlock}${body}\n\n${footer}`,
      exitCode: result.exitCode,
    }
  }

  const verdict = markdownVerdict(
    result.ruleFindings.length,
    enforceViolation,
    strictInertFailure,
    inertRules,
  )

  const rows = result.ruleFindings.map((f) => {
    const ruleId = (f.metadata?.ruleId as string | undefined) ?? 'unknown'
    const mode = (f.metadata?.mode as string | undefined) ?? 'unknown'
    return `| ${escapeMdCell(ruleId)} | ${escapeMdCell(f.severity)} | ${escapeMdCell(mode)} | ${escapeMdCell(f.title)} |`
  })
  const table = ['| Rule | Severity | Mode | Title |', '|---|---|---|---|', ...rows].join('\n')

  return {
    text: `${CHECK_HEADER}\n\n${inertBlock}${verdict}\n\n${table}\n\n${footer}`,
    exitCode: result.exitCode,
  }
}
