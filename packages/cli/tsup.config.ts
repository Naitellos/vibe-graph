import { cp, readdir, rm, stat } from 'node:fs/promises'
import { dirname, join, resolve } from 'node:path'
import { fileURLToPath } from 'node:url'
import { defineConfig } from 'tsup'

const __dirname = dirname(fileURLToPath(import.meta.url))

export default defineConfig({
  entry: ['src/index.ts', 'src/bin.ts'],
  format: ['esm'],
  dts: true,
  sourcemap: true,
  clean: true,
  target: 'node22',
  splitting: false,
  noExternal: [/^@vibegraph\//],
  banner: ({ format }) => (format === 'esm' ? { js: '#!/usr/bin/env node' } : {}),
  async onSuccess() {
    const uiDist = resolve(__dirname, '../ui/dist')
    try {
      await stat(join(uiDist, 'index.html'))
    } catch {
      throw new Error(
        "packages/ui/dist not found — UI must be built before CLI (run 'pnpm --filter @codearch/ui build')",
      )
    }

    const destDir = resolve(__dirname, 'dist/ui')

    // Remove stale dest dir so we always start clean
    await rm(destDir, { recursive: true, force: true })

    // Copy ui dist into dist/ui/
    await cp(uiDist, destDir, { recursive: true })

    const files = await readdir(destDir, { recursive: true })
    console.log(`[tsup onSuccess] copied UI dist (${files.length} files)`)
  },
})
