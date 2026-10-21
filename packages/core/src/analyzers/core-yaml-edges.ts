import type { Edge } from '../schema/edge.js'
import type { Evidence } from '../schema/evidence.js'
import type { Analyzer, AnalyzerContext, AnalyzerResult } from './types.js'

function makeYamlEdge(fromId: string, toId: string, evidenceId: string): Edge {
  return {
    id: `${fromId}->${toId}:depends_on:yaml`,
    from: fromId,
    to: toId,
    kind: 'depends_on',
    category: 'domain',
    source: 'yaml',
    confidence: 'high',
    evidenceIds: [evidenceId],
    weight: 1,
    runtimeWeight: 1,
    typeOnlyWeight: 0,
    dynamicWeight: 0,
    metadata: {},
  }
}

function makeYamlEvidence(docId: string, detail: string, idx: number): Evidence {
  return {
    id: `ev:yaml:${docId}:${idx}`,
    sourceKind: 'yaml',
    file: `.vibegraph/subsystems/${docId}.yml`,
    detail,
    confidence: 'high',
    coupling: 'runtime',
  }
}

export const coreYamlEdgesAnalyzer: Analyzer = {
  id: 'core/yaml-edges',
  description:
    'emits subsystem→subsystem depends_on edges from SubsystemDoc.depends_on/consumed_by',
  async run(ctx: AnalyzerContext): Promise<AnalyzerResult> {
    const edges: Edge[] = []
    const evidence: Evidence[] = []
    for (const doc of ctx.subsystemDocs) {
      let i = 0
      for (const target of doc.depends_on) {
        const ev = makeYamlEvidence(doc.id, `depends_on: ${target}`, i++)
        evidence.push(ev)
        edges.push(makeYamlEdge(`subsystem:${doc.id}`, `subsystem:${target}`, ev.id))
      }
      for (const consumer of doc.consumed_by) {
        const ev = makeYamlEvidence(doc.id, `consumed_by: ${consumer}`, i++)
        evidence.push(ev)
        edges.push(makeYamlEdge(`subsystem:${consumer}`, `subsystem:${doc.id}`, ev.id))
      }
    }
    return { nodes: [], edges, evidence }
  },
}
