import { type DestinationStream, type Logger, pino } from 'pino'
import pinoPretty from 'pino-pretty'

export interface CreateCliLoggerOptions {
  /** Output raw JSON instead of pretty-printed lines. */
  json: boolean
  /** Suppress info/debug messages (only warn/error/fatal). */
  quiet: boolean
  /**
   * Optional destination override (test injection).
   * - In json mode: used directly as pino destination.
   * - In pretty mode: passed as pino-pretty's `destination` option.
   * Defaults to process.stdout.
   */
  destination?: DestinationStream
}

/**
 * Build a pino Logger configured for CLI use.
 *
 * Mode matrix:
 *   default        → pino-pretty to stdout, level=info
 *   --json         → raw JSONL to stdout, level=info
 *   --quiet        → pino-pretty to stdout, level=warn
 *   --json --quiet → raw JSONL to stdout, level=warn
 */
export function createCliLogger(opts: CreateCliLoggerOptions): Logger {
  const level = opts.quiet ? 'warn' : 'info'

  if (opts.json) {
    // Raw JSONL — pino's default serializer, no pretty transform
    return pino({ level }, opts.destination ?? process.stdout)
  }

  // Pretty-printed: pipe pino through pino-pretty
  // When destination is provided (e.g. test injection), pass it to pino-pretty
  const prettyStream = pinoPretty({
    colorize: true,
    translateTime: 'HH:MM:ss',
    ignore: 'pid,hostname',
    ...(opts.destination != null ? { destination: opts.destination, sync: true } : {}),
  })

  return pino({ level }, prettyStream)
}
