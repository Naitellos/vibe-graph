import { escapeMdCell, mdFooter } from './format-md.js'
import type { RunValidateDiffResult } from './validate-diff.js'

type DiffOk = Extract<RunValidateDiffResult, { status: 'ok' }>

/** PostToolUse hook stdout. Empty string ⇒ print nothing (clean). Exit code stays 0. */
export function formatHookOutput(r: DiffOk, mode: 'advisory' | 'enforce'): string {
  if (!r.conformance) return ''
  // Build a set of edge-keys covered by `undeclared` drift findings so we can
  // suppress the duplicate `new-coupling` detail line in curated mode. The
  // `new-coupling` finding still counts toward the headline/byKind (computed in
  // core) — we only skip the redundant detail line here.
  const undeclaredEdges = new Set(
    [...r.newViolations, ...r.newFindings]
      .filter((f) => f.type === 'undeclared')
      .map((f) => f.involvedNodeIds.join('|')),
  )
  const findingLines = [...r.newViolations, ...r.newFindings]
    .filter((f) => !(f.type === 'new-coupling' && undeclaredEdges.has(f.involvedNodeIds.join('|'))))
    .map((f) => `- ${f.title}`)
    .join('\n')
  const message = `vibe-graph: ${r.conformance.headline}${findingLines ? `\n${findingLines}` : ''}`
  if (mode === 'enforce') {
    return JSON.stringify({ decision: 'block', reason: message })
  }
  return JSON.stringify({
    hookSpecificOutput: { hookEventName: 'PostToolUse', additionalContext: message },
  })
}

export interface FormatOptions {
  json: boolean
  /** Emit a GitHub-PR-comment-ready markdown block. Takes precedence over json. */
  markdown?: boolean
}

export interface FormattedOutput {
  text: string
  exitCode: 0 | 1
}

const VALIDATE_MARKER = '<!-- vibe-graph-validate-diff -->'
const VALIDATE_HEADER = '## 🔭 Vibe Graph — Diff Validation'

export function formatValidateDiffResult(
  result: RunValidateDiffResult,
  opts: FormatOptions,
): FormattedOutput {
  if (opts.markdown) {
    return formatValidateDiffMarkdown(result)
  }

  if (result.status === 'error') {
    if (opts.json) {
      return { text: JSON.stringify({ status: 'error', error: result.error }), exitCode: 1 }
    }
    return { text: `Error: ${result.error}`, exitCode: 1 }
  }

  if (opts.json) {
    return {
      text: JSON.stringify({
        status: 'ok',
        verdict: result.verdict,
        exitCode: result.exitCode,
        newViolations: result.newViolations,
        removedViolations: result.removedViolations,
        newFindings: result.newFindings,
        removedFindings: result.removedFindings,
      }),
      exitCode: result.exitCode,
    }
  }

  const lines: string[] = []
  if (result.conformance?.headline) {
    lines.push(result.conformance.headline)
    lines.push('')
  }
  if (result.newViolations.length > 0) {
    lines.push(`VIOLATIONS (${result.newViolations.length}):`)
    for (const v of result.newViolations) {
      const ruleId = (v.metadata?.ruleId as string | undefined) ?? 'unknown'
      const mode = (v.metadata?.mode as string | undefined) ?? 'unknown'
      const sigil = mode === 'enforce' ? '❌' : mode === 'warn' ? '⚠' : '·'
      lines.push(`  ${sigil} ${ruleId} (${v.severity}, ${mode})`)
      lines.push(`     ${v.title}`)
    }
    lines.push('')
  }

  if (result.newFindings.length > 0) {
    lines.push(`NEW FINDINGS (${result.newFindings.length}):`)
    for (const f of result.newFindings) {
      lines.push(`  ⚠ ${f.title} (${f.severity})`)
    }
    lines.push('')
  }

  if (result.removedViolations.length > 0) {
    lines.push(`REMOVED VIOLATIONS: ${result.removedViolations.length}`)
    lines.push('')
  }

  lines.push(`Status: ${result.verdict.toUpperCase()}${result.exitCode === 1 ? ' (exit 1)' : ''}`)
  return { text: lines.join('\n'), exitCode: result.exitCode }
}

function formatValidateDiffMarkdown(result: RunValidateDiffResult): FormattedOutput {
  const footer = mdFooter(VALIDATE_MARKER)

  if (result.status === 'error') {
    return { text: `${VALIDATE_HEADER}\n\n> ⚠️ ${result.error}\n\n${footer}`, exitCode: 1 }
  }

  const badge =
    result.verdict === 'violation'
      ? '❌ **VIOLATION**'
      : result.verdict === 'warn'
        ? '⚠️ **WARN**'
        : '✅ **OK**'

  const sections: string[] = [VALIDATE_HEADER, '', `Verdict: ${badge}`, '']

  if (result.conformance?.headline) {
    sections.push(`**${result.conformance.headline}**`, '')
  }

  if (result.newViolations.length > 0) {
    sections.push(`**New rule violations (${result.newViolations.length}):**`, '')
    sections.push('| Rule | Severity | Mode | Title |', '|---|---|---|---|')
    for (const v of result.newViolations) {
      const ruleId = (v.metadata?.ruleId as string | undefined) ?? 'unknown'
      const mode = (v.metadata?.mode as string | undefined) ?? 'unknown'
      sections.push(
        `| ${escapeMdCell(ruleId)} | ${escapeMdCell(v.severity)} | ${escapeMdCell(mode)} | ${escapeMdCell(v.title)} |`,
      )
    }
    sections.push('')
  }

  if (result.newFindings.length > 0) {
    sections.push(`**New findings (${result.newFindings.length}):**`, '')
    for (const f of result.newFindings) {
      sections.push(`- ⚠️ ${escapeMdCell(f.title)} (${escapeMdCell(f.severity)})`)
    }
    sections.push('')
  }

  if (result.removedViolations.length > 0) {
    sections.push(`✅ Resolved ${result.removedViolations.length} prior violation(s).`, '')
  }

  if (result.newViolations.length === 0 && result.newFindings.length === 0) {
    sections.push('No new architecture risks introduced by this diff.', '')
  }

  sections.push(footer)
  return { text: sections.join('\n'), exitCode: result.exitCode }
}
