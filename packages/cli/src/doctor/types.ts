export type CheckStatus = 'ok' | 'warn' | 'error' | 'info'

export interface CheckResult {
  /** Stable id of the check (used in JSON output). */
  id: string
  status: CheckStatus
  /** Human-readable summary line. */
  message: string
  /** Optional remediation hint. */
  suggestion?: string
}

export interface Check {
  /** Stable id (e.g. 'system/node-version'). */
  readonly id: string
  /** Short human description for log output. */
  readonly description: string
  /** Run the check. Returns a CheckResult — never throws. */
  run(ctx: CheckContext): Promise<CheckResult>
}

export interface CheckContext {
  /** Resolved project root. */
  projectRoot: string
}
