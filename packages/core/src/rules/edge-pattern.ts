import { isPurelyTypeOnlyEdge } from '../graph/edge-categories.js'
import type { Finding } from '../schema/finding.js'
import type { Node } from '../schema/node.js'
import type { NodeMatcher, Rule } from '../schema/rule.js'
import type { LoadedSnapshot } from '../snapshot/load-snapshot.js'
import type { RuleEvaluatorContext } from './engine.js'

// ── Type alias ────────────────────────────────────────────────────────────────

export type EdgePatternRule = Extract<Rule, { kind: 'edge-pattern' }>

// ── Node matching helpers ─────────────────────────────────────────────────────

/**
 * Returns true if the given subsystem node satisfies ALL set fields on the matcher.
 * - `matcher.layer` → `node.layer === matcher.layer`
 * - `matcher.subsystem` → `node.id === `subsystem:${matcher.subsystem}``
 * - `matcher.exclude_subsystem` → `node.id !== `subsystem:${matcher.exclude_subsystem}``
 */
function isSubsystemMatched(node: Node, matcher: NodeMatcher): boolean {
  if (matcher.layer !== undefined && node.layer !== matcher.layer) {
    return false
  }
  if (matcher.subsystem !== undefined && node.id !== `subsystem:${matcher.subsystem}`) {
    return false
  }
  if (
    matcher.exclude_subsystem !== undefined &&
    node.id === `subsystem:${matcher.exclude_subsystem}`
  ) {
    return false
  }
  return true
}

/**
 * Find the subsystem that owns a file node via an incoming `contains` edge
 * (emitted by core-subsystems analyzer / yaml-edges). Returns the FIRST owning
 * subsystem found; files normally have at most one owner.
 */
function getOwningSubsystem(fileNode: Node, snapshot: LoadedSnapshot): Node | undefined {
  const incoming = snapshot.edgesByTargetId.get(fileNode.id) ?? []
  for (const edge of incoming) {
    if (edge.kind !== 'contains') continue
    const fromNode = snapshot.nodesById.get(edge.from)
    if (fromNode?.kind === 'subsystem') return fromNode
  }
  return undefined
}

/**
 * Returns true if the given node satisfies ALL set fields on the matcher.
 *
 * Matching algorithm:
 * - For subsystem nodes: direct attribute match (layer / id).
 * - For file nodes: resolve to the file's owning subsystem (via `contains` edges)
 *   and match against THAT. This makes import-level rules (relation: 'imports',
 *   which emit file→file edges in the AST analyzer) work intuitively with
 *   layer/subsystem matchers — e.g. `from: { layer: 'domain' }` matches a file
 *   whose owning subsystem has `layer: domain`. Unowned files cannot match
 *   layer or subsystem matchers (no determinate layer), but DO satisfy a
 *   bare `exclude_subsystem` matcher (vacuously "not in that subsystem").
 * - Other node kinds (package, external, etc.) match only if all matcher
 *   fields are absent (none are set in practice — NodeMatcher.refine requires
 *   at least one).
 */
export function isNodeMatched(node: Node, matcher: NodeMatcher, snapshot: LoadedSnapshot): boolean {
  if (node.kind === 'subsystem') {
    return isSubsystemMatched(node, matcher)
  }

  if (node.kind === 'file') {
    const owner = getOwningSubsystem(node, snapshot)
    if (owner !== undefined) {
      return isSubsystemMatched(owner, matcher)
    }
    // Unowned file: cannot satisfy layer or subsystem matchers (no determinate
    // attribute). exclude_subsystem is vacuously satisfied (file is not in
    // that subsystem since it's in no subsystem at all).
    if (matcher.layer !== undefined) return false
    if (matcher.subsystem !== undefined) return false
    return true
  }

  // Non-subsystem / non-file nodes (package, external, etc.): no concept of
  // layer or subsystem ownership in MVP, so layer/subsystem matchers never
  // match. exclude_subsystem is vacuously satisfied.
  if (matcher.layer !== undefined) return false
  if (matcher.subsystem !== undefined) return false
  return true
}

// ── Pure evaluator ────────────────────────────────────────────────────────────

/**
 * Evaluates an `edge-pattern` rule against the working snapshot.
 *
 * For `forbidden: true`: iterates all edges filtered by `rule.relation`, matches
 * each edge's `from` node against `rule.from` and `to` node against `rule.to`,
 * and emits a Finding for every matching edge.
 *
 * For `forbidden: false`: placeholder — returns [] immediately.
 * TODO(v1.x): emit Finding when required edge is missing.
 */
export function evaluateEdgePattern(rule: EdgePatternRule, ctx: RuleEvaluatorContext): Finding[] {
  // v1.x placeholder: required-edge semantics not yet implemented
  if (!rule.forbidden) {
    // TODO(v1.x): emit Finding when required edge is missing
    return []
  }

  const { snapshot } = ctx
  const findings: Finding[] = []

  for (const edge of snapshot.raw.edges) {
    // Filter by relation kind
    if (edge.kind !== rule.relation) continue

    // Purely type-only edges (import type of a shared contract) are not runtime
    // coupling — they must not trigger forbidden-dependency findings.
    if (isPurelyTypeOnlyEdge(edge)) continue

    // Look up from/to nodes
    const fromNode = snapshot.nodesById.get(edge.from)
    const toNode = snapshot.nodesById.get(edge.to)

    // Skip edges whose nodes are not in the snapshot (shouldn't happen, but be defensive)
    if (!fromNode || !toNode) continue

    // Check if both nodes match their respective matchers (snapshot is needed so
    // file endpoints can be resolved to their owning subsystem's layer/id).
    if (!isNodeMatched(fromNode, rule.from, snapshot)) continue
    if (!isNodeMatched(toNode, rule.to, snapshot)) continue

    // Match found — emit a Finding
    const fromTitle = fromNode.title
    const toTitle = toNode.title

    const finding: Finding = {
      id: `rule:${rule.id}:${edge.from}->${edge.to}`,
      domain: 'rule',
      type: 'rule-violation',
      detectorId: 'rules-engine',
      severity: rule.severity,
      title: `Forbidden edge (${rule.id}): ${fromTitle} → ${toTitle}`,
      summary: `Edge ${edge.from} → ${edge.to} matches forbidden pattern.`,
      status: 'open',
      involvedNodeIds: [edge.from, edge.to],
      evidenceIds: [...edge.evidenceIds],
      metadata: { ruleId: rule.id, mode: rule.mode, edgeId: edge.id },
    }

    findings.push(finding)
  }

  return findings
}
