import { defineConfig } from 'vitest/config'

export default defineConfig({
  test: {
    projects: [
      {
        // Alias internal cross-package imports to source so unit tests run against
        // current TypeScript (not stale dist). Without this, `pnpm test:unit` fails
        // on any new export added to @vibegraph/core until `pnpm build` rebuilds dist.
        // E2E intentionally points to dist (below) because it spawns the built CLI.
        resolve: {
          alias: {
            '@codearch/core': new URL('./packages/core/src/index.ts', import.meta.url).pathname,
          },
        },
        test: {
          name: 'unit',
          include: ['packages/*/src/**/*.test.ts'],
          environment: 'node',
        },
      },
      {
        test: {
          name: 'fixtures',
          include: ['packages/core/test/fixtures/**/*.test.ts'],
          environment: 'node',
          testTimeout: 10_000,
        },
      },
      {
        resolve: {
          alias: {
            '@codearch/core': new URL('./packages/core/src/index.ts', import.meta.url).pathname,
          },
        },
        test: {
          name: 'mcp',
          include: ['packages/mcp/test/**/*.test.ts'],
          environment: 'node',
          testTimeout: 10_000,
        },
      },
      {
        test: {
          name: 'ui',
          include: ['packages/ui/test/**/*.test.tsx', 'packages/ui/src/**/*.test.tsx'],
          environment: 'jsdom',
          setupFiles: ['./packages/ui/test/setup.ts'],
        },
      },
      {
        resolve: {
          alias: {
            '@codearch/core': new URL('./packages/core/dist/index.js', import.meta.url).pathname,
          },
        },
        test: {
          name: 'e2e',
          include: ['test/e2e/**/*.test.ts'],
          environment: 'node',
          testTimeout: 120_000,
          globalSetup: ['./test/e2e/global-setup.ts'],
        },
      },
      {
        test: {
          name: 'smoke',
          include: ['test/smoke/**/*.test.ts'],
          environment: 'node',
          testTimeout: 180_000,
        },
      },
      {
        test: {
          name: 'invariants',
          include: ['test/invariants/**/*.test.ts'],
          environment: 'node',
        },
      },
      {
        test: {
          name: 'plugin',
          include: ['packages/plugin/**/*.test.ts'],
          passWithNoTests: true,
        },
      },
    ],
  },
})
