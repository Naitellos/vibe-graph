import { defineConfig } from '@playwright/test'

export default defineConfig({
  testDir: './test/playwright',
  timeout: 60_000,
  use: { baseURL: 'http://localhost:5174' },
  webServer: {
    command: 'pnpm --filter @codearch/ui exec vite preview --port 5174 --strictPort',
    url: 'http://localhost:5174',
    reuseExistingServer: true,
    timeout: 60_000,
  },
})
