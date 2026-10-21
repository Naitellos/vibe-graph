import { expect, test } from '@playwright/test'

const MINIMAL_SNAPSHOT = {
  meta: {
    schemaVersion: '0.1.0',
    scanId: '00000000-0000-0000-0000-000000000000',
    builtAt: '2024-01-01T00:00:00.000Z',
    projectRoot: '/repo',
    projectName: 'test-project',
    vibegraphVersion: '0.0.0',
    scanDurationMs: 0,
    fileCounts: { scanned: 0, indexed: 0, skipped: 0 },
  },
  nodes: [],
  edges: [],
  evidence: [],
  findings: [],
}

const MINIMAL_OVERVIEW = {
  project: {
    name: 'Smoke Test Project',
    root: '/repo',
    snapshotBuiltAt: '2024-01-01T00:00:00.000Z',
    snapshotScanId: '00000000-0000-0000-0000-000000000001',
  },
  counts: {
    subsystems: 0,
    files: 0,
    edges: 0,
    findings: 0,
    externalPackages: 0,
  },
}

test('cockpit smoke', async ({ page }) => {
  // NOTE: Playwright routes are checked in LIFO order (last-registered wins).
  // Register the fallback catch-all FIRST so that specific routes (added after)
  // take precedence.

  // Fallback for any other /api/* call (blast-radius, findings, node, etc.)
  await page.route('**/api/**', (route) =>
    route.fulfill({ status: 200, contentType: 'application/json', body: '{}' }),
  )

  // Specific mocks — registered AFTER the fallback so they win (LIFO priority)
  await page.route('**/api/snapshot', (route) =>
    route.fulfill({
      status: 200,
      contentType: 'application/json',
      body: JSON.stringify(MINIMAL_SNAPSHOT),
    }),
  )

  await page.route('**/api/overview', (route) =>
    route.fulfill({
      status: 200,
      contentType: 'application/json',
      body: JSON.stringify(MINIMAL_OVERVIEW),
    }),
  )

  // Collect console errors and page errors.
  // Filter out the expected WebSocket connection failure — the preview server does
  // not implement a /ws endpoint, so the ws-bus emits a single harmless error.
  const errors: string[] = []
  page.on('console', (msg) => {
    if (msg.type() === 'error') {
      const text = msg.text()
      // Ignore expected WS handshake failure from the ToastBar bus
      if (text.includes('WebSocket connection') && text.includes('/ws')) return
      errors.push(text)
    }
  })
  page.on('pageerror', (err) => errors.push(String(err)))

  await page.goto('/')

  // Assert TopBar is visible
  await expect(page.getByTestId('topbar')).toBeVisible({ timeout: 15_000 })

  // Assert GraphCanvas SVG is present
  await expect(page.locator('svg[data-testid="graph-canvas"]')).toBeVisible({ timeout: 15_000 })

  // Assert zero console errors
  expect(errors).toEqual([])
})
