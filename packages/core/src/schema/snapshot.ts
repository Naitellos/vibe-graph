import { z } from 'zod'
import { EdgeSchema } from './edge.js'
import { EvidenceSchema } from './evidence.js'
import { FindingSchema } from './finding.js'
import { NodeSchema } from './node.js'

/**
 * Current canonical schema version for the on-disk snapshot.
 * Bump on every breaking change to Node/Edge/Evidence/Finding/Snapshot shapes.
 * Consumers that read a snapshot with a different version MUST fail loudly,
 * never silently fall back.
 */
export const SCHEMA_VERSION = '0.1.0' as const

export const SnapshotMetaSchema = z.object({
  schemaVersion: z.literal(SCHEMA_VERSION),
  scanId: z.uuid(),
  builtAt: z.iso.datetime(),
  projectRoot: z.string().min(1),
  projectName: z.string().min(1),
  vibegraphVersion: z.string().min(1),
  scanDurationMs: z.number().int().nonnegative(),
  fileCounts: z.object({
    scanned: z.number().int().nonnegative(),
    indexed: z.number().int().nonnegative(),
    skipped: z.number().int().nonnegative(),
  }),
})
export type SnapshotMeta = z.infer<typeof SnapshotMetaSchema>

export const SnapshotSchema = z.object({
  meta: SnapshotMetaSchema,
  nodes: z.array(NodeSchema),
  edges: z.array(EdgeSchema),
  evidence: z.array(EvidenceSchema),
  findings: z.array(FindingSchema),
})
export type Snapshot = z.infer<typeof SnapshotSchema>
