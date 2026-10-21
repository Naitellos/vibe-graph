import type { Logger } from 'pino'
import type { FindingDomain } from '../schema/common.js'
import type { Finding } from '../schema/finding.js'
import type { LoadedSnapshot } from '../snapshot/load-snapshot.js'

export interface DetectorContext {
  snapshot: LoadedSnapshot
  log: Logger
}

export interface Detector {
  readonly id: string
  readonly description: string
  readonly domain: FindingDomain
  run(ctx: DetectorContext): Promise<Finding[]>
}
