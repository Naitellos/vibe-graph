import { expect, test } from '@playwright/test'

// ─── Window augmentation (tsc-only; no runtime effect) ───────────────────────
declare global {
  interface Window {
    __fakeWs?: {
      onmessage?: (ev: MessageEvent) => void
      onopen?: (ev: Event) => void
      onclose?: (ev: CloseEvent) => void
      onerror?: (ev: Event) => void
      readyState: number
    }
  }
}

// ─── Fixtures ────────────────────────────────────────────────────────────────

const BACKFILL_ENTRY = {
  id: '1-aabbcc',
  ts: Date.now() - 5_000,
  tool: 'prepare_task',
  durationMs: 42,
  status: 'ok',
  summary: 'refactor payments · 3 files · 2 rules',
  argsRedacted:
    '{"intent":"refactor payments","paths":["src/payments/transactions.ts"],"mode":"refactor"}',
  resultRedacted: '{"taskId":"task-playwright-001"}',
  redactions: 0,
  truncated: false,
}

// ─── Test 1: backfill entry renders + expands ─────────────────────────────────

test('Activity Log renders backfilled entry + expands', async ({ page }) => {
  // Fallback catch-all FIRST (lowest LIFO priority)
  await page.route('**/api/**', (r) =>
    r.fulfill({ status: 200, contentType: 'application/json', body: '{}' }),
  )

  // Specific mock: agent-activity returns one entry.
  // The store fetches /api/agent-activity (no ?since= on first load).
  await page.route('**/api/agent-activity**', (r) =>
    r.fulfill({
      status: 200,
      contentType: 'application/json',
      body: JSON.stringify({ entries: [BACKFILL_ENTRY] }),
    }),
  )

  await page.goto('/?workspace=activity')

  // ── Entry row visible ─────────────────────────────────────────────────────
  // The tool name appears in the chip span inside the ActivityEntry button row.
  // Use the Expand button (aria-label "Expand prepare_task") as a precise locator.
  await expect(page.getByRole('button', { name: /expand prepare_task/i })).toBeVisible({
    timeout: 15_000,
  })
  await expect(page.getByText(/refactor payments/)).toBeVisible()

  // ── Click to expand ───────────────────────────────────────────────────────
  // ActivityEntry renders a button with aria-label "Expand <tool>"
  await page.getByRole('button', { name: /expand prepare_task/i }).click()

  // ── Expanded panel shows metadata footer ─────────────────────────────────
  // ActivityEntry footer: "redactions: {redactions} · truncated: {truncated ? 'yes' : 'no'}"
  await expect(page.getByText(/redactions: 0/)).toBeVisible({ timeout: 5_000 })
  await expect(page.getByText(/truncated: no/)).toBeVisible()
})

// ─── Test 2: live WS badge path ───────────────────────────────────────────────
//
// Strategy (a): stub globalThis.WebSocket via addInitScript so we can dispatch
// a synthetic WS message carrying an 'activity' event.  The ws-bus reads from
// globalThis.WebSocket, so injecting a fake constructor before the app boots
// gives us full control without a real server.
//
// The test:
//   1. Navigate to /?workspace=map  (not activity, so badge should increment)
//   2. Dispatch a synthetic 'activity' entry via the fake WebSocket
//   3. Assert data-testid="activity-badge" appears on the Activity button
//   4. Click Activity  → badge clears (markRead())

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

test('Activity Log: live WS entry increments badge on Map then clears on switch', async ({
  page,
}) => {
  // Fallback catch-all
  await page.route('**/api/**', (r) =>
    r.fulfill({ status: 200, contentType: 'application/json', body: '{}' }),
  )
  // Provide snapshot so the app renders without errors (GraphCanvas expects it)
  await page.route('**/api/snapshot', (r) =>
    r.fulfill({
      status: 200,
      contentType: 'application/json',
      body: JSON.stringify(MINIMAL_SNAPSHOT),
    }),
  )

  // Inject a fake WebSocket before the app boots.
  // IMPORTANT: addInitScript runs as plain JS in the browser — no TypeScript
  // annotations allowed.  The fake WS:
  //   - stores itself as window.__fakeWs so the test can reach onmessage
  //   - fires onopen after a short delay (mimics async connect)
  //   - does NOT fire onclose on close() with code 1000 (so ws-bus won't reconnect)
  await page.addInitScript(() => {
    class FakeWebSocket extends EventTarget {
      url: string
      readyState: number
      protocol: string
      extensions: string
      binaryType: BinaryType
      bufferedAmount: number
      onopen: ((ev: Event) => void) | null
      onmessage: ((ev: MessageEvent) => void) | null
      onclose: ((ev: CloseEvent) => void) | null
      onerror: ((ev: Event) => void) | null
      static CONNECTING = 0
      static OPEN = 1
      static CLOSING = 2
      static CLOSED = 3

      constructor(url: string) {
        super()
        this.url = String(url)
        this.readyState = 0 // CONNECTING
        this.protocol = ''
        this.extensions = ''
        this.binaryType = 'blob'
        this.bufferedAmount = 0
        this.onopen = null
        this.onmessage = null
        this.onclose = null
        this.onerror = null
        ;(window as unknown as { __fakeWs?: unknown }).__fakeWs = this
        setTimeout(() => {
          this.readyState = 1 // OPEN
          if (this.onopen) this.onopen(new Event('open'))
        }, 50)
      }
      send() {}
      close(code?: number) {
        this.readyState = 3 // CLOSED
        // Only fire onclose for non-normal closes so ws-bus doesn't reconnect
        if (code !== 1000 && this.onclose) {
          this.onclose(new CloseEvent('close', { code: code ?? 1001, wasClean: false }))
        }
      }
    }
    ;(globalThis as unknown as { WebSocket: unknown }).WebSocket =
      FakeWebSocket as unknown as typeof WebSocket
  })

  await page.goto('/?workspace=map')

  // Wait for the app to render (TopBar is a reliable sentinel)
  await expect(page.getByTestId('topbar')).toBeVisible({ timeout: 15_000 })

  // Give the fake WebSocket time to open and the app to attach its onmessage
  await page.waitForTimeout(200)

  // Dispatch a synthetic 'activity' event through the fake WS
  const liveEntry = {
    id: '9-live11',
    ts: Date.now(),
    tool: 'prepare_task',
    durationMs: 77,
    status: 'ok',
    summary: 'live refactor · 1 file',
    argsRedacted: '{"intent":"live"}',
    resultRedacted: '{"taskId":"t-live"}',
    redactions: 0,
    truncated: false,
  }

  await page.evaluate((entry) => {
    const ws = window.__fakeWs
    if (ws?.onmessage) {
      const payload = JSON.stringify({ type: 'activity', entry })
      ws.onmessage(new MessageEvent('message', { data: payload }))
    }
  }, liveEntry)

  // Badge should appear on the Activity button (we're on Map, not Activity)
  await expect(page.getByTestId('activity-badge')).toBeVisible({ timeout: 5_000 })
  await expect(page.getByTestId('activity-badge')).toHaveText('1')

  // Click the Activity workspace button → badge clears (markRead is called)
  await page.getByRole('button', { name: /^Activity/ }).click()

  await expect(page.getByTestId('activity-badge')).not.toBeVisible({ timeout: 5_000 })
})
