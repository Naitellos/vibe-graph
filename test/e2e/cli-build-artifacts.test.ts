/**
 * Asserts that the CLI build has correctly bundled the UI dist into dist/ui/.
 *
 * The global-setup runs `pnpm build` (ordered: core+mcp+ui first, then CLI),
 * so by the time this test runs the copy should already have happened via the
 * tsup onSuccess hook in packages/cli/tsup.config.ts.
 */

import { readFileSync, readdirSync, statSync } from 'node:fs'
import { dirname, join, resolve } from 'node:path'
import { fileURLToPath } from 'node:url'
import { describe, expect, it } from 'vitest'

const __dirname = dirname(fileURLToPath(import.meta.url))
const uiDir = resolve(__dirname, '../../packages/cli/dist/ui')

describe('cli build artifacts — dist/ui/', () => {
  it('packages/cli/dist/ui/index.html exists and is non-empty', () => {
    const indexHtml = join(uiDir, 'index.html')
    const stat = statSync(indexHtml)
    expect(stat.isFile()).toBe(true)
    expect(stat.size).toBeGreaterThan(0)
  })

  it('packages/cli/dist/ui/assets/ exists and contains at least one .js file', () => {
    const assetsDir = join(uiDir, 'assets')
    const stat = statSync(assetsDir)
    expect(stat.isDirectory()).toBe(true)

    const files = readdirSync(assetsDir)
    const jsFiles = files.filter((f) => f.endsWith('.js'))
    expect(jsFiles.length).toBeGreaterThan(0)
  })

  it('packages/cli/dist/ui/assets/ contains at least one .css file', () => {
    const assetsDir = join(uiDir, 'assets')
    const files = readdirSync(assetsDir)
    const cssFiles = files.filter((f) => f.endsWith('.css'))
    expect(cssFiles.length).toBeGreaterThan(0)
  })

  it('packages/cli/dist/bin.js has shebang on first line', () => {
    const binJs = resolve(__dirname, '../../packages/cli/dist/bin.js')
    const content = readFileSync(binJs, 'utf-8')
    const firstLine = content.split('\n')[0]
    expect(firstLine).toBe('#!/usr/bin/env node')
  })
})
