import { findUnownedFileIds } from '../../detectors/core-drift.js'
import type { Finding } from '../../schema/finding.js'
import type { Snapshot } from '../../schema/snapshot.js'
import { buildLoadedSnapshot } from '../../snapshot/load-snapshot.js'
import type { BuiltinRule, BuiltinRuleContext } from './no-new-cycles.js'

/**
 * Test and spec files, by the conventions this ecosystem actually uses.
 *
 * Matches `foo.test.ts` / `foo.spec.tsx` in any extension, plus anything under a
 * `__tests__/`, `test/` or `tests/` directory. Deliberately path-based: node ids
 * are `file:<repo-relative path>`, so no filesystem access is needed.
 */
export function isTestFile(fileId: string): boolean {
  const path = fileId.startsWith('file:') ? fileId.slice(5) : fileId
  return (
    /\.(test|spec)\.[cm]?[jt]sx?$/.test(path) || /(^|\/)(__tests__|__mocks__|tests?)\//.test(path)
  )
}

// ── Pure evaluator ────────────────────────────────────────────────────────────

/**
 * Evaluates the `no_orphans` builtin rule.
 *
 * Emits one Finding(domain='rule') per file node in the working snapshot that
 * is not claimed by any subsystem via a `contains` edge AND was not already
 * unowned in the baseline. If baseline is null (first scan) this is a no-op by
 * design — there is no reference to compare against.
 */
export function evaluateNoNewOrphans(rule: BuiltinRule, ctx: BuiltinRuleContext): Finding[] {
  const { snapshot, baseline } = ctx

  // No baseline → first scan; rule is no-op (nothing to compare against)
  if (baseline === null) {
    return []
  }

  // Build a LoadedSnapshot from the baseline so we can run the same helper
  const baselineSnap: Snapshot = {
    meta: {
      schemaVersion: '0.1.0',
      // ephemeral snapshot built for cycle/orphan diff — never persisted or validated
      scanId: '00000000-0000-0000-0000-000000000000',
      builtAt: baseline.createdAt,
      projectRoot: '/',
      projectName: 'baseline',
      vibegraphVersion: '0.0.0',
      scanDurationMs: 0,
      fileCounts: { scanned: 0, indexed: 0, skipped: 0 },
    },
    nodes: baseline.nodes,
    edges: baseline.edges,
    evidence: [],
    findings: baseline.findings,
  }
  const baselineLoaded = buildLoadedSnapshot(baselineSnap)

  // Compute unowned file IDs for working snapshot and baseline
  const workingUnowned = findUnownedFileIds(snapshot)
  const baselineUnowned = findUnownedFileIds(baselineLoaded)

  const findings: Finding[] = []

  for (const fileId of workingUnowned) {
    // If it was already unowned in baseline, it's not a new orphan
    if (baselineUnowned.has(fileId)) continue

    // A newly added test file is not an architectural event. Measured across two
    // fire-rate batches, `no-new-orphans` was 31 of 32 total signals and roughly
    // half of those were `*.test.*` twins of the file being added — the agent gets
    // told off for writing a test. In an edit loop a signal that is usually noise
    // trains the model to discount the channel, so this tier stays quiet on tests.
    if (isTestFile(fileId)) continue

    const node = snapshot.nodesById.get(fileId)
    const fileTitle = node?.title ?? fileId

    const finding: Finding = {
      id: `rule:${rule.id}:${fileId}`,
      domain: 'rule',
      type: 'rule-violation',
      detectorId: 'rules-engine',
      severity: rule.severity,
      title: `New unowned file (${rule.id}): ${fileTitle}`,
      summary: `The file ${fileTitle} is not claimed by any subsystem and was not present as an orphan in the baseline. Add it to a subsystem or exclude it explicitly.`,
      status: 'open',
      involvedNodeIds: [fileId],
      evidenceIds: [],
      metadata: { ruleId: rule.id, mode: rule.mode },
    }

    findings.push(finding)
  }

  return findings
}
