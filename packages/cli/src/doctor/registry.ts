import type { Check, CheckContext, CheckResult } from './types.js'

export interface RunChecksOptions {
  checks: readonly Check[]
  ctx: CheckContext
}

/**
 * Run a list of checks sequentially (predictable output order).
 * Each check's run() should not throw; if it does, we capture as 'error' status.
 */
export async function runChecks(opts: RunChecksOptions): Promise<CheckResult[]> {
  const results: CheckResult[] = []
  for (const check of opts.checks) {
    try {
      const result = await check.run(opts.ctx)
      results.push(result)
    } catch (err) {
      results.push({
        id: check.id,
        status: 'error',
        message: `Check threw: ${err instanceof Error ? err.message : String(err)}`,
        suggestion: 'Report this as a bug if it persists.',
      })
    }
  }
  return results
}
