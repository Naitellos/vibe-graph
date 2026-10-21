import { z } from 'zod'
import type { ValidateDiffOutput } from './diff-validation.js'

const isSubsystem = (id: string) => id.startsWith('subsystem:')
const FindingLiteSchema = z.object({
  id: z.string(),
  title: z.string(),
  severity: z.string(),
  involvedNodeIds: z.array(z.string()),
})
export type FindingLite = z.infer<typeof FindingLiteSchema>

export const ValidateDiffUiPayloadSchema = z.object({
  status: z.enum(['ok', 'warn', 'violation']),
  headline: z.string().optional(),
  baselineSnapshotId: z.string(),
  edges: z.object({
    added: z.array(z.object({ from: z.string(), to: z.string(), kind: z.string() })),
    removed: z.array(z.object({ from: z.string(), to: z.string(), kind: z.string() })),
  }),
  nodes: z.object({
    added: z.array(z.object({ id: z.string(), kind: z.string(), title: z.string() })),
    removed: z.array(z.object({ id: z.string(), title: z.string() })),
  }),
  blastRadius: z.array(
    z.object({ id: z.string(), before: z.number(), after: z.number(), delta: z.string() }),
  ),
  violations: z.object({ added: z.array(FindingLiteSchema), removed: z.array(FindingLiteSchema) }),
  findings: z.object({ added: z.array(FindingLiteSchema), removed: z.array(FindingLiteSchema) }),
  counts: z.object({
    addedEdges: z.number(),
    removedEdges: z.number(),
    newViolations: z.number(),
    removedViolations: z.number(),
    newFindings: z.number(),
    resolvedFindings: z.number(),
  }),
})
export type ValidateDiffUiPayload = z.infer<typeof ValidateDiffUiPayloadSchema>

export function toValidateDiffUiPayload(o: ValidateDiffOutput): ValidateDiffUiPayload {
  const subEdges = (es: ValidateDiffOutput['graphDelta']['newEdges']) =>
    es
      .filter((e) => isSubsystem(e.from) && isSubsystem(e.to))
      .map((e) => ({ from: e.from, to: e.to, kind: e.kind }))
  const lite = (fs: ValidateDiffOutput['newViolations']) =>
    fs.map((f) => ({
      id: f.id,
      title: f.title,
      severity: f.severity,
      involvedNodeIds: f.involvedNodeIds,
    }))
  // Compute the subsystem-scoped edge sets once; `edges` and `counts` share them.
  const addedEdges = subEdges(o.graphDelta.newEdges)
  const removedEdges = subEdges(o.graphDelta.removedEdges)
  return {
    status: o.status,
    headline: o.conformance?.headline,
    baselineSnapshotId: o.baselineSnapshotId,
    edges: { added: addedEdges, removed: removedEdges },
    nodes: {
      added: o.graphDelta.newNodes
        .filter((n) => isSubsystem(n.id))
        .map((n) => ({ id: n.id, kind: n.kind, title: n.title })),
      removed: o.graphDelta.removedNodes
        .filter((n) => isSubsystem(n.id))
        .map((n) => ({ id: n.id, title: n.title })),
    },
    blastRadius: Object.entries(o.riskDelta.blastRadius).map(([id, v]) => ({
      id,
      before: v.before,
      after: v.after,
      delta: v.delta,
    })),
    violations: { added: lite(o.newViolations), removed: lite(o.removedViolations) },
    findings: { added: lite(o.newFindings), removed: lite(o.removedFindings) },
    counts: {
      addedEdges: addedEdges.length,
      removedEdges: removedEdges.length,
      newViolations: o.newViolations.length,
      removedViolations: o.removedViolations.length,
      newFindings: o.newFindings.length,
      resolvedFindings: o.removedFindings.length,
    },
  }
}
