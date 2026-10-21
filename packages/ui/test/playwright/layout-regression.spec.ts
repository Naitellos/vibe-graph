/**
 * Playwright layout-regression test for cockpit shell.
 *
 * Phase 5's smoke test only verified "page raises, no console errors" — it
 * missed five real layout bugs that surfaced when a user looked at the cockpit
 * for the first time (see the UI-1..UI-5 task chain).
 *
 * This test mocks /api with a 4-subsystem snapshot and asserts the visible
 * structure: TopBar separator, panel-header vs panel-body containment, SVG
 * canvas sizing, and absence of the "ago ago" suffix bug.
 *
 * Each assertion below corresponds to a specific UI-N task:
 *   • TopBar separator              → UI-2
 *   • Panel-body outside header     → UI-1 + UI-4
 *   • Canvas fits viewport          → UI-5
 *   • "Last scan: X" not "X ago ago"→ UI-3
 */

import { expect, test } from '@playwright/test'

const FOUR_SUBSYSTEM_SNAPSHOT = {
  meta: {
    schemaVersion: '0.1.0',
    scanId: '00000000-0000-0000-0000-000000000000',
    builtAt: '2024-01-01T00:00:00.000Z',
    projectRoot: '/repo',
    projectName: 'layout-regression',
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

// 2 minutes ago → must render as "2m ago" exactly once.
const OVERVIEW_2M_AGO = {
  project: {
    name: 'layout-regression',
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

test('cockpit layout — all panels, separator, canvas fit, no duplicated suffix', async ({
  page,
}) => {
  // Fallback for any /api/* path we don't explicitly mock
  await page.route('**/api/**', (route) =>
    route.fulfill({ status: 200, contentType: 'application/json', body: '{}' }),
  )
  await page.route('**/api/snapshot', (route) =>
    route.fulfill({
      status: 200,
      contentType: 'application/json',
      body: JSON.stringify(FOUR_SUBSYSTEM_SNAPSHOT),
    }),
  )
  await page.route('**/api/overview', (route) =>
    route.fulfill({
      status: 200,
      contentType: 'application/json',
      body: JSON.stringify(OVERVIEW_2M_AGO),
    }),
  )

  await page.setViewportSize({ width: 1440, height: 900 })
  await page.goto('/')

  // Wait for the canvas + at least one subsystem node to render
  await expect(page.locator('svg[data-testid="graph-canvas"]')).toBeVisible({ timeout: 15_000 })
  await expect(page.locator('g[data-node-id="subsystem:core"]')).toBeVisible({ timeout: 15_000 })

  // UI-2: TopBar text must have whitespace OR a separator between project name
  //       and the time-ago badge. Bug shape: "layout-regression2m ago".
  const topbarText = (await page.getByTestId('topbar').textContent()) ?? ''
  expect(topbarText).toMatch(/layout-regression[\s·]+(just now|\d+[smhd] ago)/)
  expect(topbarText).not.toMatch(/layout-regression\d+[smhd] ?ago/)

  // UI-3: "Last scan: X" must contain "ago" exactly once. Bug shape: "ago ago".
  const lastScanText = (await page.getByTestId('last-scan').textContent()) ?? ''
  const agoMatches = lastScanText.match(/\bago\b/g) ?? []
  expect(agoMatches).toHaveLength(1)

  // UI-1 + UI-4: panel headers must NOT contain panel bodies.
  // Bug shape: PanelHeader is a flex-row; LeftPanel/RightPanel crammed body
  // content into the header's `children` slot, collapsing the whole panel
  // into a 2rem horizontal strip.
  const leftHeaderHasBody = await page.evaluate(() => {
    const headers = document.querySelectorAll('.cockpit-panel-header')
    for (const header of headers) {
      if (header.querySelector('.cockpit-panel-body') !== null) return true
    }
    return false
  })
  expect(leftHeaderHasBody).toBe(false)

  // There must be at least 2 panel-body containers (left + right; center has
  // its own canvas-wrapper structure).
  const bodyCount = await page.locator('.cockpit-panel-body').count()
  expect(bodyCount).toBeGreaterThanOrEqual(2)

  // UI-5: all 4 subsystem nodes must be visible in the viewport (no overflow
  // off-screen). Bug shape: SVG rendered taller than viewport → bottom nodes
  // pushed off-screen at Y > window.innerHeight.
  const allVisible = await page.evaluate(() => {
    const nodes = Array.from(document.querySelectorAll('g.vg-nodes > g[data-node-id]'))
    if (nodes.length !== 4) return { ok: false, reason: `expected 4 nodes, got ${nodes.length}` }
    for (const n of nodes) {
      const r = (n as Element).getBoundingClientRect()
      const inViewport = r.x >= 0 && r.x < window.innerWidth && r.y >= 0 && r.y < window.innerHeight
      if (!inViewport) {
        return {
          ok: false,
          reason: `node ${n.getAttribute('data-node-id')} at (${Math.round(r.x)}, ${Math.round(r.y)}) is off-screen (viewport ${window.innerWidth}x${window.innerHeight})`,
        }
      }
    }
    return { ok: true, reason: 'all 4 nodes in viewport' }
  })
  expect(allVisible.ok, allVisible.reason).toBe(true)

  // UI-5 (bound): the SVG itself must fit within the viewport. Bug shape:
  // svg rendered at intrinsic viewBox aspect (793×1621) instead of filling
  // its container (which had no constrained height).
  const svgSize = await page.locator('svg[data-testid="graph-canvas"]').evaluate((el) => {
    const r = el.getBoundingClientRect()
    return { width: r.width, height: r.height }
  })
  expect(svgSize.height).toBeLessThanOrEqual(900)
  expect(svgSize.width).toBeLessThanOrEqual(1440)
})

/**
 * Regression: removing the SVG viewBox (PR #18) made the graph fit once and not
 * re-fit on container resize. A ResizeObserver in use-pan-zoom must re-fit so the
 * graph keeps filling the viewport after the SVG resizes (panel collapse, window
 * resize, fullscreen). Bug shape: after a resize the .vg-viewport kept its old
 * transform and nodes drifted off-screen / stayed framed for the old size.
 */
test('graph re-fits when the SVG resizes (ResizeObserver)', async ({ page }) => {
  await page.route('**/api/**', (route) =>
    route.fulfill({ status: 200, contentType: 'application/json', body: '{}' }),
  )
  await page.route('**/api/snapshot', (route) =>
    route.fulfill({
      status: 200,
      contentType: 'application/json',
      body: JSON.stringify(FOUR_SUBSYSTEM_SNAPSHOT),
    }),
  )
  await page.route('**/api/overview', (route) =>
    route.fulfill({
      status: 200,
      contentType: 'application/json',
      body: JSON.stringify(OVERVIEW_2M_AGO),
    }),
  )

  await page.setViewportSize({ width: 1440, height: 900 })
  await page.goto('/')
  await expect(page.locator('svg[data-testid="graph-canvas"]')).toBeVisible({ timeout: 15_000 })
  await expect(page.locator('g[data-node-id="subsystem:core"]')).toBeVisible({ timeout: 15_000 })

  const viewport = page.locator('g.vg-viewport')
  // Let the initial fit settle, then capture the framing transform.
  await expect.poll(async () => viewport.getAttribute('transform')).not.toBe('')
  const transformBefore = await viewport.getAttribute('transform')

  // Shrink the window substantially — the SVG (width/height:100%) shrinks too,
  // so the ResizeObserver must re-fit (different scale + translate).
  await page.setViewportSize({ width: 820, height: 640 })

  await expect
    .poll(async () => viewport.getAttribute('transform'), { timeout: 10_000 })
    .not.toBe(transformBefore)

  // All 4 nodes must remain inside the new viewport after the re-fit.
  const allVisible = await page.evaluate(() => {
    const nodes = Array.from(document.querySelectorAll('g.vg-nodes > g[data-node-id]'))
    if (nodes.length !== 4) return { ok: false, reason: `expected 4 nodes, got ${nodes.length}` }
    for (const n of nodes) {
      const r = (n as Element).getBoundingClientRect()
      const inViewport = r.x >= 0 && r.x < window.innerWidth && r.y >= 0 && r.y < window.innerHeight
      if (!inViewport) {
        return {
          ok: false,
          reason: `node ${n.getAttribute('data-node-id')} off-screen after resize`,
        }
      }
    }
    return { ok: true, reason: 'all 4 nodes in viewport' }
  })
  expect(allVisible.ok, allVisible.reason).toBe(true)
})

/**
 * Regression: a fully-collapsed side panel must be reopenable by mouse and come
 * back at a usable width — not a 5px sliver — and that width must survive a
 * reload. Bug shape: the collapse button lived inside the 0-width panel (no
 * mouse affordance), `expand()` restored only a sliver, and onLayoutChanged
 * persisted the sliver so the panel mounted collapsed forever.
 */
test('collapsed panel reopens by mouse to a usable width and survives reload', async ({ page }) => {
  await page.route('**/api/**', (route) =>
    route.fulfill({ status: 200, contentType: 'application/json', body: '{}' }),
  )
  await page.route('**/api/snapshot', (route) =>
    route.fulfill({
      status: 200,
      contentType: 'application/json',
      body: JSON.stringify(FOUR_SUBSYSTEM_SNAPSHOT),
    }),
  )
  await page.route('**/api/overview', (route) =>
    route.fulfill({
      status: 200,
      contentType: 'application/json',
      body: JSON.stringify(OVERVIEW_2M_AGO),
    }),
  )

  await page.setViewportSize({ width: 1440, height: 900 })
  await page.goto('/')
  await expect(page.locator('svg[data-testid="graph-canvas"]')).toBeVisible({ timeout: 15_000 })

  const widthOfLeft = () =>
    page.getByTestId('panel-left').evaluate((el) => Math.round(el.getBoundingClientRect().width))

  // Starts expanded.
  expect(await widthOfLeft()).toBeGreaterThan(100)

  // Collapse via the in-panel button.
  await page.getByRole('button', { name: /collapse left panel/i }).click()
  await expect(page.getByTestId('panel-left')).toHaveAttribute('data-collapsed', 'true')
  expect(await widthOfLeft()).toBeLessThan(20)

  // The in-panel button is now hidden — the edge tab is the only mouse affordance.
  const expandTab = page.getByRole('button', { name: /expand left panel/i })
  await expect(expandTab).toBeVisible()
  await expandTab.click()

  // Reopened to a usable width (not a sliver). `data-collapsed` is omitted
  // (not "false") when expanded.
  await expect(page.getByTestId('panel-left')).not.toHaveAttribute('data-collapsed', 'true')
  await expect.poll(widthOfLeft).toBeGreaterThan(100)

  // Survives reload — the persisted width was not poisoned by the collapse.
  await page.reload()
  await expect(page.locator('svg[data-testid="graph-canvas"]')).toBeVisible({ timeout: 15_000 })
  await expect(page.getByTestId('panel-left')).not.toHaveAttribute('data-collapsed', 'true')
  expect(await widthOfLeft()).toBeGreaterThan(100)
})

/**
 * Regression: a tiny / poisoned persisted width (e.g. left over from the old
 * sliver bug, or a near-zero drag) must not make an un-collapsed panel mount
 * too narrow to show its content. A usable minimum width is enforced so the
 * panel self-heals to a readable size instead of clipping.
 */
test('panels mount at a usable width even with a poisoned persisted width', async ({ page }) => {
  await page.route('**/api/**', (route) =>
    route.fulfill({ status: 200, contentType: 'application/json', body: '{}' }),
  )
  await page.route('**/api/snapshot', (route) =>
    route.fulfill({
      status: 200,
      contentType: 'application/json',
      body: JSON.stringify(FOUR_SUBSYSTEM_SNAPSHOT),
    }),
  )
  await page.route('**/api/overview', (route) =>
    route.fulfill({
      status: 200,
      contentType: 'application/json',
      body: JSON.stringify(OVERVIEW_2M_AGO),
    }),
  )

  await page.setViewportSize({ width: 1200, height: 900 })
  await page.goto('/')
  await expect(page.locator('svg[data-testid="graph-canvas"]')).toBeVisible({ timeout: 15_000 })

  // Poison both widths to a sliver, not collapsed, and reload.
  await page.evaluate(() => {
    localStorage.setItem(
      'vibegraph.layout',
      JSON.stringify({
        state: {
          leftWidth: 5,
          rightWidth: 5,
          leftCollapsed: false,
          rightCollapsed: false,
          leftActiveTab: 'findings',
          rightActiveTab: 'detail',
        },
        version: 0,
      }),
    )
  })
  await page.reload()
  await expect(page.locator('svg[data-testid="graph-canvas"]')).toBeVisible({ timeout: 15_000 })

  // Both panels must render at a usable (readable) width, not a sliver.
  const widthOf = (id: string) =>
    page.getByTestId(id).evaluate((el) => Math.round(el.getBoundingClientRect().width))
  await expect(page.getByTestId('panel-left')).not.toHaveAttribute('data-collapsed', 'true')
  await expect(page.getByTestId('panel-right')).not.toHaveAttribute('data-collapsed', 'true')
  expect(await widthOf('panel-left')).toBeGreaterThanOrEqual(200)
  expect(await widthOf('panel-right')).toBeGreaterThanOrEqual(200)
})
