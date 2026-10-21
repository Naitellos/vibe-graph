import { describe, expect, it } from 'vitest'
import type { Node } from '../schema/node.js'
import type { Rule } from '../schema/rule.js'
import type { Snapshot } from '../schema/snapshot.js'
import { buildLoadedSnapshot } from '../snapshot/load-snapshot.js'
import { collectInertRuleWarnings } from './inert-rules.js'

// ── Test helpers ──────────────────────────────────────────────────────────────

function makeSubsystemNode(id: string): Node {
  return {
    id: `subsystem:${id}`,
    kind: 'subsystem',
    title: id,
    layer: 'unknown',
    status: 'unknown',
    tags: [],
    files: [],
    metadata: {},
  }
}

function makeSnapshot(nodes: Node[]) {
  const snap: Snapshot = {
    meta: {
      schemaVersion: '0.1.0',
      scanId: 'test-scan',
      builtAt: new Date().toISOString(),
      projectRoot: '/test',
      projectName: 'test',
      vibegraphVersion: '0.0.0',
      scanDurationMs: 0,
      fileCounts: { scanned: 0, indexed: 0, skipped: 0 },
    },
    nodes,
    edges: [],
    evidence: [],
    findings: [],
  }
  return buildLoadedSnapshot(snap)
}

function edgePatternRule(over: Partial<Extract<Rule, { kind: 'edge-pattern' }>> = {}): Rule {
  return {
    kind: 'edge-pattern',
    id: 'core-neutrality',
    title: 'Core neutrality',
    severity: 'high',
    mode: 'enforce',
    from: { subsystem: 'core-engine' },
    to: { subsystem: 'core-extractor' },
    relation: 'imports',
    forbidden: true,
    description: '',
    ...over,
  }
}

// ── Tests ─────────────────────────────────────────────────────────────────────

describe('collectInertRuleWarnings', () => {
  it('flags an edge-pattern rule whose from/to subsystems are absent from the graph', () => {
    // Graph only knows `core` and `ui` — the rule references core-engine/core-extractor.
    const snapshot = makeSnapshot([makeSubsystemNode('core'), makeSubsystemNode('ui')])

    const warnings = collectInertRuleWarnings([edgePatternRule()], snapshot)

    const unknown = warnings.map((w) => w.unknownSubsystem).sort()
    expect(unknown).toEqual(['core-engine', 'core-extractor'])
    expect(warnings.every((w) => w.ruleId === 'core-neutrality')).toBe(true)
    // Positive matchers → the rule truly cannot fire.
    expect(warnings.every((w) => w.kind === 'inert')).toBe(true)
  })

  it('does not flag a rule whose referenced subsystems all exist', () => {
    const snapshot = makeSnapshot([
      makeSubsystemNode('core-engine'),
      makeSubsystemNode('core-extractor'),
    ])

    const warnings = collectInertRuleWarnings([edgePatternRule()], snapshot)

    expect(warnings).toEqual([])
  })

  it('does not flag layer-only matchers (no subsystem id referenced)', () => {
    const snapshot = makeSnapshot([makeSubsystemNode('core')])
    const rule = edgePatternRule({ from: { layer: 'infra' }, to: { layer: 'domain' } })

    const warnings = collectInertRuleWarnings([rule], snapshot)

    expect(warnings).toEqual([])
  })

  it('flags an absent exclude_subsystem reference', () => {
    const snapshot = makeSnapshot([makeSubsystemNode('core')])
    const rule = edgePatternRule({
      from: { layer: 'domain' },
      to: { exclude_subsystem: 'nope' },
    })

    const warnings = collectInertRuleWarnings([rule], snapshot)

    expect(warnings).toHaveLength(1)
    expect(warnings[0]?.unknownSubsystem).toBe('nope')
    // A dead exclusion does NOT make the rule inert — it matches more broadly.
    expect(warnings[0]?.kind).toBe('dead-reference')
  })

  it('flags a boundary rule referencing an absent protectedSubsystem / allowedFrom', () => {
    const snapshot = makeSnapshot([makeSubsystemNode('core')])
    const rule: Rule = {
      kind: 'boundary',
      id: 'protect-secrets',
      title: 'Protect secrets',
      severity: 'high',
      mode: 'enforce',
      protectedSubsystem: 'secrets',
      allowedFrom: ['core', 'ghost'],
      description: '',
    }

    const warnings = collectInertRuleWarnings([rule], snapshot)

    const unknown = warnings.map((w) => w.unknownSubsystem).sort()
    expect(unknown).toEqual(['ghost', 'secrets'])
    // Missing protected target → rule can never fire; missing allowance → the
    // boundary is STRICTER than intended, not inert.
    expect(warnings.find((w) => w.unknownSubsystem === 'secrets')?.kind).toBe('inert')
    expect(warnings.find((w) => w.unknownSubsystem === 'ghost')?.kind).toBe('dead-reference')
  })

  it('ignores builtin rules (they reference no subsystem ids)', () => {
    const snapshot = makeSnapshot([makeSubsystemNode('core')])
    const rule: Rule = {
      kind: 'builtin',
      id: 'builtin:no-new-cycles',
      severity: 'medium',
      mode: 'advisory',
      check: 'no_cycles',
      title: '',
      description: '',
    }

    const warnings = collectInertRuleWarnings([rule], snapshot)

    expect(warnings).toEqual([])
  })
})
