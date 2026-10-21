import { appendFileSync, mkdirSync } from 'node:fs'
import { dirname, join } from 'node:path'
import {
  type ActivityEntry,
  ValidateDiffOutputSchema,
  generateActivityEntryId,
  redactSecrets,
  toValidateDiffUiPayload,
} from '@codearch/core'

const DEFAULT_LIMIT_BYTES = 4096
const TRUNCATE_MARKER = ' …(truncated)'

export interface ActivityLogMiddlewareOptions {
  projectRoot: string
  /** Per-field byte cap after redaction. Defaults to 4096. */
  limitBytes?: number
  /** Override for Date.now() — tests inject a fixed clock. */
  now?: () => number
}
export type MiddlewareInner<T> = () => Promise<T>
export type Middleware = <T extends { structuredContent?: unknown }>(
  tool: string,
  args: unknown,
  inner: MiddlewareInner<T>,
) => Promise<T>

export function createActivityLogMiddleware(opts: ActivityLogMiddlewareOptions): Middleware {
  const limitBytes = opts.limitBytes ?? DEFAULT_LIMIT_BYTES
  const now = opts.now ?? (() => Date.now())
  const logPath = join(opts.projectRoot, '.vibegraph/cache/agent-activity.ndjson')
  return async function activityLogMiddleware<T extends { structuredContent?: unknown }>(
    tool: string,
    args: unknown,
    inner: MiddlewareInner<T>,
  ): Promise<T> {
    const tsStart = now()
    const argsJson = safeStringify(args)
    let result: T | undefined
    let errorMessage: string | undefined
    let thrownError: unknown
    let status: 'ok' | 'error' = 'ok'
    try {
      result = await inner()
      const maybeIsError = (result as unknown as { isError?: boolean }).isError
      if (maybeIsError === true) {
        status = 'error'
        const sc = (
          result as unknown as {
            structuredContent?: { error?: { message?: string; code?: string } }
          }
        ).structuredContent
        errorMessage =
          sc?.error?.message ??
          (sc?.error?.code !== undefined ? String(sc.error.code) : '(tool returned isError)')
      }
    } catch (err) {
      status = 'error'
      thrownError = err
      errorMessage = err instanceof Error ? err.message : String(err)
    }
    const durationMs = now() - tsStart
    // redactSecrets → { text, redactions: { totalCount } }; use .text + .redactions.totalCount
    const argsRedaction = redactSecrets(argsJson)
    let resultRedaction: { value: string; count: number; truncated: boolean } | undefined
    if (result !== undefined && status === 'ok' && result.structuredContent !== undefined) {
      const r = redactSecrets(safeStringify(result.structuredContent))
      const t = truncate(r.text, limitBytes)
      resultRedaction = { value: t.value, count: r.redactions.totalCount, truncated: t.truncated }
    }
    const argsTrunc = truncate(argsRedaction.text, limitBytes)
    const entry: ActivityEntry = {
      id: generateActivityEntryId(tsStart, argsJson),
      ts: tsStart,
      tool,
      durationMs,
      status,
      summary:
        status === 'ok'
          ? deriveSummary(tool, args, result?.structuredContent, errorMessage)
          : undefined,
      argsRedacted: argsTrunc.value,
      ...(resultRedaction !== undefined ? { resultRedacted: resultRedaction.value } : {}),
      ...(errorMessage !== undefined ? { errorMessage } : {}),
      redactions: argsRedaction.redactions.totalCount + (resultRedaction?.count ?? 0),
      truncated: argsTrunc.truncated || (resultRedaction?.truncated ?? false),
    }
    try {
      mkdirSync(dirname(logPath), { recursive: true })
      appendFileSync(logPath, `${JSON.stringify(entry)}\n`)
    } catch {
      // Logging failure must never break tool dispatch.
    }
    if (tool === 'validate_diff' && status === 'ok' && result?.structuredContent !== undefined) {
      const parsed = ValidateDiffOutputSchema.safeParse(result.structuredContent)
      if (parsed.success) {
        try {
          const eventsPath = join(opts.projectRoot, '.vibegraph/cache/agent-events.ndjson')
          mkdirSync(dirname(eventsPath), { recursive: true })
          appendFileSync(eventsPath, `${JSON.stringify(toValidateDiffUiPayload(parsed.data))}\n`)
        } catch {
          // sidecar write must never break tool dispatch
        }
      }
    }
    if (thrownError !== undefined) throw thrownError // preserve original error type
    return result as T
  }
}

function safeStringify(v: unknown): string {
  try {
    return JSON.stringify(v ?? {})
  } catch {
    return '"(unserializable)"'
  }
}

function truncate(s: string, limit: number): { value: string; truncated: boolean } {
  if (Buffer.byteLength(s, 'utf8') <= limit) return { value: s, truncated: false }
  const cut = s.slice(0, Math.max(0, limit - TRUNCATE_MARKER.length))
  return { value: cut + TRUNCATE_MARKER, truncated: true }
}

function deriveSummary(
  tool: string,
  args: unknown,
  result: unknown,
  errorMessage: string | undefined,
): string | undefined {
  if (errorMessage !== undefined) return undefined
  try {
    const a = (args ?? {}) as Record<string, unknown>
    const r = (result ?? {}) as Record<string, unknown>
    switch (tool) {
      case 'prepare_task': {
        const intentRaw = String(a.intent ?? '')
        const intent = intentRaw.slice(0, 40)
        const files = Array.isArray(
          (r as { requiredContext?: { files?: unknown[] } }).requiredContext?.files,
        )
          ? (r as { requiredContext: { files: unknown[] } }).requiredContext.files.length
          : 0
        const rules = Array.isArray(r.rules) ? (r.rules as unknown[]).length : 0
        return `${intent}${intentRaw.length > 40 ? '…' : ''} · ${files} files · ${rules} rules`
      }
      case 'validate_diff': {
        const status = String((r as { status?: string }).status ?? '')
        const count = (k: string) => {
          const v = (r as Record<string, unknown>)[k]
          return Array.isArray(v) ? (v as unknown[]).length : 0
        }
        const newV = count('newViolations')
        const newF = count('newFindings')
        const remV = count('removedViolations')
        const remF = count('removedFindings')
        const headline = (r as { conformance?: { headline?: string } }).conformance?.headline
        return `${headline ? `${headline} — ` : ''}${status} · ${newV} new violation(s), ${newF} new finding(s), ${remV + remF} resolved`
      }
      default:
        return undefined
    }
  } catch {
    return '(unparseable)'
  }
}
