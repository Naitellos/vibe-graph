import { expect, test } from '@playwright/test'

// ─── Fixtures ────────────────────────────────────────────────────────────────

const FOUR_SUBSYSTEM_SNAPSHOT = {
  meta: {
    schemaVersion: '0.1.0',
    scanId: '00000000-0000-0000-0000-000000000000',
    builtAt: '2024-01-01T00:00:00.000Z',
    projectRoot: '/repo',
    projectName: 'validate-diff-test',
    vibegraphVersion: '0.0.0',
    scanDurationMs: 0,
    fileCounts: { scanned: 0, indexed: 0, skipped: 0 },
  },
  nodes: [
    {
      id: 'subsystem:core',
      kind: 'subsystem',
      title: 'core',
      layer: 'domain',
      status: 'unknown',
      tags: [],
    },
    {
      id: 'subsystem:cli',
      kind: 'subsystem',
      title: 'cli',
      layer: 'horizontal',
      status: 'unknown',
      tags: [],
    },
    {
      id: 'subsystem:mcp',
      kind: 'subsystem',
      title: 'mcp',
      layer: 'horizontal',
      status: 'unknown',
      tags: [],
    },
    {
      id: 'subsystem:ui',
      kind: 'subsystem',
      title: 'ui',
      layer: 'horizontal',
      status: 'unknown',
      tags: [],
    },
  ],
  edges: [],
  evidence: [],
  findings: [],
}

const OVERVIEW = {
  project: {
    name: 'validate-diff-test',
    root: '/repo',
    snapshotBuiltAt: new Date(Date.now() - 2 * 60 * 1000).toISOString(),
    snapshotScanId: '00000000-0000-0000-0000-000000000001',
  },
  counts: {
    subsystems: 4,
    files: 0,
    edges: 0,
    findings: 0,
    externalPackages: 0,
  },
}

/**
 * ValidateDiffUiPayload returned by the mocked /api/validate-diff POST.
 * Contains:
 *   - one added subsystem edge: cli → mcp
 *   - a blast badge on core (blastRadius delta +1)
 *   - 1 new violation on mcp
 */
const VALIDATE_DIFF_RESPONSE = {
  ok: true,
  data: {
    status: 'violation',
    baselineSnapshotId: '00000000-0000-0000-0000-000000000000',
    edges: {
      added: [{ from: 'subsystem:cli', to: 'subsystem:mcp', kind: 'uses' }],
      removed: [],
    },
    nodes: { added: [], removed: [] },
    blastRadius: [{ id: 'subsystem:core', before: 1, after: 2, delta: '+1' }],
    violations: {
      added: [
        {
          id: 'viol-1',
          title: 'Circular dependency introduced',
          severity: 'error',
          involvedNodeIds: ['subsystem:mcp'],
        },
      ],
      removed: [],
    },
    findings: { added: [], removed: [] },
    counts: {
      addedEdges: 1,
      removedEdges: 0,
      newViolations: 1,
      removedViolations: 0,
      newFindings: 0,
      resolvedFindings: 0,
    },
  },
}

// ─── Test ─────────────────────────────────────────────────────────────────────

test('Validate button triggers diff overlay and Clear diff removes it', async ({ page }) => {
  // Fallback catch-all FIRST (LIFO: registered last wins → specific routes registered after win)
  await page.route('**/api/**', (r) =>
    r.fulfill({ status: 200, contentType: 'application/json', body: '{}' }),
  )

  // Specific mocks
  await page.route('**/api/snapshot', (r) =>
    r.fulfill({
      status: 200,
      contentType: 'application/json',
      body: JSON.stringify(FOUR_SUBSYSTEM_SNAPSHOT),
    }),
  )

  await page.route('**/api/overview', (r) =>
    r.fulfill({
      status: 200,
      contentType: 'application/json',
      body: JSON.stringify(OVERVIEW),
    }),
  )

  await page.route('**/api/validate-diff', (r) =>
    r.fulfill({
      status: 200,
      contentType: 'application/json',
      body: JSON.stringify(VALIDATE_DIFF_RESPONSE),
    }),
  )

  await page.setViewportSize({ width: 1440, height: 900 })
  await page.goto('/')

  // Wait for the canvas and at least one subsystem node to render
  await expect(page.locator('svg[data-testid="graph-canvas"]')).toBeVisible({ timeout: 15_000 })
  await expect(page.locator('g[data-node-id="subsystem:core"]')).toBeVisible({ timeout: 15_000 })

  // Click the Validate button
  await page.click('[data-testid="validate-btn"]')

  // ── Assert diff overlay is active ──────────────────────────────────────────
  await expect(page.locator('g.vg-viewport[data-diff-active="true"]')).toBeVisible({
    timeout: 10_000,
  })

  // ── Assert added diff edge exists ──────────────────────────────────────────
  await expect(page.locator('path.vg-edge[data-diff-kind="added"]').first()).toBeAttached({
    timeout: 10_000,
  })

  // ── Assert diff-summary panel is visible and contains "+1" edge count ──────
  const diffSummary = page.getByTestId('diff-summary')
  await expect(diffSummary).toBeVisible({ timeout: 10_000 })
  await expect(diffSummary).toContainText('+1')

  // ── Click "Clear diff" and assert overlay is removed ─────────────────────
  await page.getByRole('button', { name: /clear diff/i }).click()

  await expect(page.locator('[data-diff-active="true"]')).toHaveCount(0, { timeout: 5_000 })
})
