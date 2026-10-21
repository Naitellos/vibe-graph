/**
 * test/smoke/real-world.test.ts
 *
 * Optional, env-gated smoke test against a real-world TypeScript project.
 *
 * Without VIBEGRAPH_SMOKE_ROOT: `describe.skip` → tests are skipped cleanly
 * (no error, no fail, no false positive).
 *
 * With VIBEGRAPH_SMOKE_ROOT=/path/to/some-ts-project: full scan runs,
 * asserts performance + size + structural integrity.
 */

import { describe, expect, it } from 'vitest'
import { scan } from '../../packages/core/src/scan/scan.js'
import { SnapshotSchema } from '../../packages/core/src/schema/snapshot.js'

const smokeRoot = process.env.VIBEGRAPH_SMOKE_ROOT
const d = smokeRoot !== undefined && smokeRoot.length > 0 ? describe : describe.skip

d('real-world smoke (env-gated)', () => {
  it('scans within 30 seconds, produces valid snapshot, finds ≥1 subsystem, snapshot file ≤5MB', async () => {
    // smokeRoot is asserted non-empty by the gating check above
    const root = smokeRoot as string

    // Time the scan
    const t0 = Date.now()
    const snapshot = await scan({ root })
    const elapsedMs = Date.now() - t0

    // Performance: < 30 seconds
    expect(elapsedMs, `scan took ${elapsedMs}ms (limit 30000)`).toBeLessThan(30_000)

    // Validity: re-validate via Zod (scan already does this, but explicit reassurance)
    expect(() => SnapshotSchema.parse(snapshot)).not.toThrow()

    // Structural: ≥1 subsystem detected
    const subsystems = snapshot.nodes.filter((n) => n.kind === 'subsystem')
    expect(subsystems.length, `found ${subsystems.length} subsystems (limit ≥1)`).toBeGreaterThan(0)

    // Drift findings: if the project has curated SubsystemDocs, all 3 drift kinds
    // (stale, undeclared, unowned) should be present; otherwise just assert drift findings exist.
    const driftFindings = snapshot.findings.filter((f) => f.domain === 'drift')
    const hasCuratedDocs = snapshot.edges.some((e) => e.source === 'yaml')
    if (hasCuratedDocs) {
      const staleFindings = driftFindings.filter((f) => f.id.includes('stale'))
      const undeclaredFindings = driftFindings.filter((f) => f.id.includes('undeclared'))
      const unownedFindings = driftFindings.filter((f) => f.id.includes('unowned'))
      expect(
        staleFindings.length,
        `found ${staleFindings.length} stale drift findings`,
      ).toBeGreaterThanOrEqual(1)
      expect(
        undeclaredFindings.length,
        `found ${undeclaredFindings.length} undeclared drift findings`,
      ).toBeGreaterThanOrEqual(1)
      expect(
        unownedFindings.length,
        `found ${unownedFindings.length} unowned drift findings`,
      ).toBeGreaterThanOrEqual(1)
    }
    // In v0 mode (no curated docs), just assert we have drift findings at all (sanity check)
    expect(
      driftFindings.length,
      `found ${driftFindings.length} total drift findings`,
    ).toBeGreaterThan(0)

    // Size: serialize and check < 5MB
    const serialized = JSON.stringify(snapshot)
    const sizeBytes = Buffer.byteLength(serialized, 'utf-8')
    const sizeMB = sizeBytes / (1024 * 1024)
    expect(sizeBytes, `snapshot serialized to ${sizeMB.toFixed(2)}MB (limit 5MB)`).toBeLessThan(
      5 * 1024 * 1024,
    )
  })
})
