import { expect, test } from '@playwright/test'

// ─── Fixtures ────────────────────────────────────────────────────────────────

const SNAPSHOT_WITH_FILE = {
  meta: {
    schemaVersion: '0.1.0',
    scanId: '00000000-0000-0000-0000-000000000002',
    builtAt: '2024-01-01T00:00:00.000Z',
    projectRoot: '/repo',
    projectName: 'test-project',
    vibegraphVersion: '0.0.0',
    scanDurationMs: 0,
    fileCounts: { scanned: 1, indexed: 1, skipped: 0 },
  },
  nodes: [
    {
      id: 'file:src/payments/transactions.ts',
      kind: 'file',
      title: 'transactions.ts',
      layer: 'domain',
      status: 'unknown',
      tags: [],
    },
  ],
  edges: [],
  evidence: [],
  findings: [],
}

const PREPARED_TASK_OUTPUT = {
  taskId: 'task-playwright-001',
  createdAt: '2024-01-01T00:00:00.000Z',
  target: {
    subsystems: ['payments'],
    files: ['src/payments/transactions.ts'],
  },
  summary: 'Refactor the payments transactions module to improve readability.',
  risks: [],
  rules: [],
  doNotDo: [],
  requiredContext: {
    files: [],
    schemaTables: [],
    relatedAdrs: [],
  },
  recommendations: [],
  tests: [],
  baselineSnapshotId: '00000000-0000-0000-0000-000000000002',
}

// ─── Test ─────────────────────────────────────────────────────────────────────

test('Change Mode: form → submit → 6 sections → copy MD', async ({ page, context }) => {
  await context.grantPermissions(['clipboard-read', 'clipboard-write'])

  // Fallback catch-all FIRST (LIFO: registered last wins, so this is the lowest priority)
  await page.route('**/api/**', (r) =>
    r.fulfill({ status: 200, contentType: 'application/json', body: '{}' }),
  )

  // Specific mocks — registered AFTER the fallback so they win (LIFO priority)
  await page.route('**/api/snapshot', (r) =>
    r.fulfill({
      status: 200,
      contentType: 'application/json',
      body: JSON.stringify(SNAPSHOT_WITH_FILE),
    }),
  )

  await page.route('**/api/prepare-task', (r) =>
    r.fulfill({
      status: 200,
      contentType: 'application/json',
      body: JSON.stringify({ ok: true, data: PREPARED_TASK_OUTPUT }),
    }),
  )

  await page.goto('/?workspace=change')

  // ── Fill intent ──────────────────────────────────────────────────────────
  const intent = page.getByPlaceholder(/intent/i)
  await expect(intent).toBeVisible({ timeout: 15_000 })
  await intent.fill('refactor payments')

  // ── Pick a path via autocomplete ─────────────────────────────────────────
  // The snapshot node id is "file:src/payments/transactions.ts"; ChangeForm
  // strips the "file:" prefix → suggests "src/payments/transactions.ts".
  const pathInput = page.getByPlaceholder('Add path…') // "Add path…"
  await expect(pathInput).toBeVisible()
  await pathInput.fill('transactions')

  // The suggestion list shows the path without the "file:" prefix
  await expect(page.getByText('src/payments/transactions.ts')).toBeVisible({ timeout: 5_000 })
  await page.getByText('src/payments/transactions.ts').first().click()

  // Path chip should now be present and input cleared
  await expect(page.getByTestId('paths-chips')).toContainText('src/payments/transactions.ts')

  // ── Submit ───────────────────────────────────────────────────────────────
  await page.getByRole('button', { name: /^Submit$/ }).click()

  // ── Assert all 6 sections render ─────────────────────────────────────────
  // Section renders an <h3> for each title; use getByRole('heading') for
  // exact matching, which avoids strict-mode violations from partial matches
  // in body text (e.g. "Target" appears in "No active risks scoped to target.").
  for (const sectionTitle of [
    'Target',
    'Active Risks',
    'Applicable Rules',
    'Do Not Do',
    'Required Context',
    'Recommendations / Tests',
  ]) {
    await expect(page.getByRole('heading', { name: sectionTitle, exact: true })).toBeVisible({
      timeout: 10_000,
    })
  }

  // ── Copy as Markdown ──────────────────────────────────────────────────────
  await page.getByRole('button', { name: /copy as markdown/i }).click()

  // Button label flips to the success state
  await expect(page.getByText(/Copied as Markdown/i)).toBeVisible({ timeout: 5_000 })

  // Clipboard must contain the MD header with the intent text
  const clip = await page.evaluate(() => navigator.clipboard.readText())
  expect(clip).toContain('# Prepared task: refactor payments')
})
