/**
 * Invariant: yaml-source-attribution
 *
 * For EVERY Edge{source:'yaml'} in a scan snapshot, there MUST be at least one
 * Evidence with sourceKind:'yaml' and file matching `.vibegraph/subsystems/<slug>.yml`.
 *
 * Spec reference: §4.5 (core-yaml-edges depends_on/consumed_by → 1 evidence/edge)
 *                 §4.6 (core-tables owns → 1 evidence/edge — was a v1.0 gap, fixed
 *                       in a Phase 2 follow-up; this invariant now enforces it
 *                       uniformly across both yaml analyzers)
 *                 §10.3 (this invariant is part of the release gate)
 *
 * Context:
 *   - yaml edges are produced by coreYamlEdgesAnalyzer (depends_on/consumed_by, Phase 2.1)
 *     and coreTablesAnalyzer (owns, Phase 2.2 + follow-up)
 *   - Each yaml edge has at least one Evidence pointing back to the subsystems/*.yml file
 */

import { join } from 'node:path'
import { describe, expect, it } from 'vitest'
import { scan } from '../../packages/core/src/scan/scan.js'

const RICH_YAML_FIXTURE = join(
  import.meta.dirname,
  '..',
  '..',
  'fixtures',
  'synthetic',
  'rich-yaml',
)

describe('invariant: yaml-source-attribution', () => {
  it('every yaml-sourced edge has ≥1 yaml Evidence referencing a subsystems/*.yml file', async () => {
    const snapshot = await scan({ root: RICH_YAML_FIXTURE })

    const evidenceById = new Map(snapshot.evidence.map((e) => [e.id, e]))
    const yamlEdges = snapshot.edges.filter((e) => e.source === 'yaml')

    // Fixture must exercise both yaml-edge analyzers (depends_on AND owns) so the
    // invariant is not vacuously true.
    expect(yamlEdges.length).toBeGreaterThan(0)
    expect(yamlEdges.some((e) => e.kind === 'depends_on')).toBe(true)
    expect(yamlEdges.some((e) => e.kind === 'owns')).toBe(true)

    for (const edge of yamlEdges) {
      // Every yaml edge must have at least one evidenceId
      expect(edge.evidenceIds.length).toBeGreaterThan(0)

      // …and at least one of those must resolve to a yaml-sourced Evidence
      const yamlEvidence = edge.evidenceIds
        .map((id) => evidenceById.get(id))
        .filter((ev) => ev !== undefined && ev.sourceKind === 'yaml')
      expect(yamlEvidence.length).toBeGreaterThan(0)

      // …pointing back to the right subsystems/*.yml file
      for (const ev of yamlEvidence) {
        expect(ev?.file).toMatch(/\.vibegraph\/subsystems\/[^/]+\.ya?ml$/)
      }
    }
  })
})
