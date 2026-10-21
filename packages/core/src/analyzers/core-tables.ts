import type { Edge } from '../schema/edge.js'
import type { Evidence } from '../schema/evidence.js'
import type { Node } from '../schema/node.js'
import type { Analyzer, AnalyzerContext, AnalyzerResult } from './types.js'

function makeOwnsEvidence(docId: string, tableName: string, idx: number): Evidence {
  return {
    id: `ev:yaml:${docId}:owns:${idx}`,
    sourceKind: 'yaml',
    file: `.vibegraph/subsystems/${docId}.yml`,
    detail: `schema_tables: ${tableName}`,
    confidence: 'high',
    coupling: 'runtime',
  }
}

export const coreTablesAnalyzer: Analyzer = {
  id: 'core/tables',
  description:
    'emits Node{kind:table} + owns Edge + yaml Evidence per SubsystemDoc.schema_tables (declarative-only in v1)',
  async run(ctx: AnalyzerContext): Promise<AnalyzerResult> {
    const nodes: Node[] = []
    const edges: Edge[] = []
    const evidence: Evidence[] = []
    for (const doc of ctx.subsystemDocs) {
      let i = 0
      for (const tableName of doc.schema_tables) {
        const ev = makeOwnsEvidence(doc.id, tableName, i++)
        evidence.push(ev)
        nodes.push({
          id: `table:${tableName}`,
          kind: 'table',
          title: tableName,
          layer: 'infra',
          status: 'unknown',
          tags: [],
          files: [],
          metadata: {},
        })
        edges.push({
          id: `subsystem:${doc.id}->table:${tableName}:owns`,
          from: `subsystem:${doc.id}`,
          to: `table:${tableName}`,
          kind: 'owns',
          category: 'domain',
          source: 'yaml',
          confidence: 'high',
          evidenceIds: [ev.id],
          weight: 1,
          runtimeWeight: 0,
          typeOnlyWeight: 0,
          dynamicWeight: 0,
          metadata: {},
        })
      }
    }
    return { nodes, edges, evidence }
  },
}
