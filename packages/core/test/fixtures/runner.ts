/**
 * Generic fixture runner for Vibe Graph synthetic fixtures.
 *
 * Loads expected/assertions.json from a fixture root (spec §9.2 format),
 * runs scan() on the fixture, and returns a list of failure messages.
 * An empty failures array means the fixture passed all assertions.
 */

import { readFile } from 'node:fs/promises'
import { join } from 'node:path'
import { z } from 'zod'
import { scan } from '../../src/scan/scan.js'
import type { Snapshot } from '../../src/schema/snapshot.js'

// ── Assertions schema (spec §9.2) ─────────────────────────────────────────────

const EdgeTupleSchema = z.tuple([z.string(), z.string(), z.string()])

const FindingAssertionSchema = z.object({
  type: z.string(),
  involvedNodeIds: z.array(z.string()),
})

const AssertionsSchema = z.object({
  mustHaveEdges: z.array(EdgeTupleSchema).default([]),
  mustHaveFindings: z.array(FindingAssertionSchema).default([]),
  mustNotHaveEdges: z.array(EdgeTupleSchema).default([]),
  mustNotHaveFindings: z.array(FindingAssertionSchema).default([]),
})

export type FixtureAssertions = z.infer<typeof AssertionsSchema>

// ── Loaders ───────────────────────────────────────────────────────────────────

export async function loadAssertions(fixtureRoot: string): Promise<FixtureAssertions> {
  const raw = await readFile(join(fixtureRoot, 'expected/assertions.json'), 'utf-8')
  return AssertionsSchema.parse(JSON.parse(raw))
}

// ── Set comparison for finding involvedNodeIds (order-independent) ────────────

function setsEqual(a: string[], b: string[]): boolean {
  if (a.length !== b.length) return false
  const setA = new Set(a)
  for (const item of b) {
    if (!setA.has(item)) return false
  }
  return true
}

// ── Core runner ───────────────────────────────────────────────────────────────

export interface RunFixtureResult {
  snapshot: Snapshot
  failures: string[]
}

export async function runFixture(fixtureRoot: string): Promise<RunFixtureResult> {
  const [assertions, snapshot] = await Promise.all([
    loadAssertions(fixtureRoot),
    scan({ root: fixtureRoot }),
  ])

  const failures: string[] = []

  // mustHaveEdges: each [from, to, kind] must be present
  for (const [from, to, kind] of assertions.mustHaveEdges) {
    const found = snapshot.edges.some((e) => e.from === from && e.to === to && e.kind === kind)
    if (!found) {
      failures.push(`mustHaveEdges: missing edge ${from} -[${kind}]-> ${to}`)
    }
  }

  // mustNotHaveEdges: each [from, to, kind] must NOT be present
  for (const [from, to, kind] of assertions.mustNotHaveEdges) {
    const found = snapshot.edges.some((e) => e.from === from && e.to === to && e.kind === kind)
    if (found) {
      failures.push(`mustNotHaveEdges: unexpected edge ${from} -[${kind}]-> ${to}`)
    }
  }

  // mustHaveFindings: each { type, involvedNodeIds } must exist (involvedNodeIds is set-compared)
  for (const expected of assertions.mustHaveFindings) {
    const found = snapshot.findings.some(
      (f) => f.type === expected.type && setsEqual(f.involvedNodeIds, expected.involvedNodeIds),
    )
    if (!found) {
      failures.push(
        `mustHaveFindings: missing finding type="${expected.type}" involvedNodeIds=[${expected.involvedNodeIds.join(', ')}]`,
      )
    }
  }

  // mustNotHaveFindings: each { type, involvedNodeIds } must NOT exist
  for (const expected of assertions.mustNotHaveFindings) {
    const found = snapshot.findings.some(
      (f) => f.type === expected.type && setsEqual(f.involvedNodeIds, expected.involvedNodeIds),
    )
    if (found) {
      failures.push(
        `mustNotHaveFindings: unexpected finding type="${expected.type}" involvedNodeIds=[${expected.involvedNodeIds.join(', ')}]`,
      )
    }
  }

  return { snapshot, failures }
}
