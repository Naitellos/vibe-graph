/**
 * Generic fixture runner for all synthetic fixtures (spec §9.1 / §9.2).
 *
 * For each fixture in SYNTHETIC_FIXTURES:
 *   - Resolves fixtures/synthetic/<name> relative to repo root
 *   - Runs scan() on the fixture
 *   - Asserts against expected/assertions.json (spec §9.2 format)
 */

import { dirname, join } from 'node:path'
import { fileURLToPath } from 'node:url'
import { beforeAll, describe, expect, it } from 'vitest'
import { runFixture } from './runner.js'
import type { RunFixtureResult } from './runner.js'

// ── Fixture list (spec §9.1) ───────────────────────────────────────────────────
// Hardcoded for reliable module-load-time access (no async fs at describe scope).
const SYNTHETIC_FIXTURES = [
  'simple-cycle',
  'barrel-reexport',
  'type-only-imports',
  'monorepo-workspaces',
  'orphan-file',
  'dynamic-imports',
  'high-fan-in',
  'js-only',
  // Phase 7.1: drift-case fixtures (§6.5 / §10.2)
  'drift-cases/stale-only',
  'drift-cases/undeclared-only',
  'drift-cases/both-confirmed',
  'drift-cases/unowned-file',
  'drift-cases/missing-target',
  'drift-cases/consumed-by-inverse',
  // Phase 7.2: rich-yaml full-field fixture (all 14 SubsystemDoc fields)
  'rich-yaml',
] as const

// ── Resolve path to fixtures/synthetic/ (repo root relative) ─────────────────
const __dirname = dirname(fileURLToPath(import.meta.url))
// packages/core/test/fixtures/ → ../../../../fixtures/synthetic/
const syntheticDir = join(__dirname, '../../../../fixtures/synthetic')

// ── Test loop ─────────────────────────────────────────────────────────────────

for (const fixtureName of SYNTHETIC_FIXTURES) {
  const fixtureRoot = join(syntheticDir, fixtureName)

  describe(`fixture: ${fixtureName}`, () => {
    let result: RunFixtureResult

    beforeAll(async () => {
      result = await runFixture(fixtureRoot)
    }, 15_000)

    it('snapshot has valid schema meta', () => {
      expect(result.snapshot.meta.schemaVersion).toBe('0.1.0')
      expect(result.snapshot.meta.scanId).toBeTruthy()
    })

    it('passes all assertions from assertions.json', () => {
      expect(result.failures, result.failures.join('\n')).toHaveLength(0)
    })
  })
}
