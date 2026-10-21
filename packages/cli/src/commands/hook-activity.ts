import { appendFileSync, mkdirSync } from 'node:fs'
import { dirname, join } from 'node:path'
import { type ActivityEntry, generateActivityEntryId } from '@codearch/core'
import type { RunValidateDiffResult } from './validate-diff.js'

/**
 * One activity entry per PostToolUse hook invocation. Pure — testable.
 * Mirrors the MCP activity-log middleware shape so `stats` (and the cockpit
 * tailer) read hook and MCP events from the same ndjson.
 */
export function buildHookActivityEntry(
  result: RunValidateDiffResult,
  opts: { now: number; durationMs: number; against?: string; mode?: string },
): ActivityEntry {
  const argsJson = JSON.stringify({ hook: true, against: opts.against, mode: opts.mode })
  const base = {
    id: generateActivityEntryId(opts.now, argsJson),
    ts: opts.now,
    tool: 'validate_diff_hook',
    durationMs: opts.durationMs,
    argsRedacted: argsJson,
    redactions: 0,
    truncated: false,
  }
  if (result.status === 'error') {
    return { ...base, status: 'error', errorMessage: result.error }
  }
  return {
    ...base,
    status: 'ok',
    summary: `verdict=${result.verdict} newViolations=${result.newViolations.length} newFindings=${result.newFindings.length}`,
  }
}

/** Append to .vibegraph/cache/agent-activity.ndjson. Never throws — instrumentation must not break the edit loop. */
export function appendActivityEntry(projectRoot: string, entry: ActivityEntry): void {
  try {
    const logPath = join(projectRoot, '.vibegraph/cache/agent-activity.ndjson')
    mkdirSync(dirname(logPath), { recursive: true })
    appendFileSync(logPath, `${JSON.stringify(entry)}\n`, 'utf-8')
  } catch {
    // swallow — hook feedback must never fail because of logging
  }
}
