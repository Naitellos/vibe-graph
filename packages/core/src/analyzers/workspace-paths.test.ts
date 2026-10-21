import { mkdirSync, mkdtempSync, realpathSync, symlinkSync, writeFileSync } from 'node:fs'
import { tmpdir } from 'node:os'
import { dirname, join } from 'node:path'
import { describe, expect, it } from 'vitest'
import { detectWorkspacePackages } from './workspace-paths.js'

function mkTmp(): string {
  return realpathSync(mkdtempSync(join(tmpdir(), 'vg-workspace-paths-')))
}

function touch(root: string, relPath: string, body = '') {
  const abs = join(root, relPath)
  mkdirSync(dirname(abs), { recursive: true })
  writeFileSync(abs, body)
}

describe('detectWorkspacePackages', () => {
  it('maps each workspace package to its src entry', async () => {
    const root = mkTmp()
    touch(root, 'pnpm-workspace.yaml', 'packages:\n  - packages/*\n')
    touch(root, 'packages/a/package.json', JSON.stringify({ name: '@org/a' }))
    touch(root, 'packages/a/src/index.ts')
    touch(root, 'packages/a/src/index.js')

    const pkgs = await detectWorkspacePackages(root)

    expect(pkgs).toEqual([
      {
        name: '@org/a',
        srcDirAbs: join(root, 'packages/a/src'),
        entryFilesAbs: [
          join(root, 'packages/a/src/index.ts'),
          join(root, 'packages/a/src/index.js'),
        ],
      },
    ])
  })

  it('resolves a literal workspace entry to that directory only, not its subdirectories', async () => {
    const root = mkTmp()
    touch(root, 'package.json', JSON.stringify({ name: 'mono', workspaces: ['tools'] }))
    touch(root, 'tools/package.json', JSON.stringify({ name: 'tools' }))
    touch(root, 'tools/src/index.ts')
    touch(root, 'tools/fixtures/demo/package.json', JSON.stringify({ name: 'demo-fixture' }))
    touch(root, 'tools/fixtures/demo/src/index.ts')

    const pkgs = await detectWorkspacePackages(root)

    expect(pkgs.map((p) => p.name)).toEqual(['tools'])
  })

  it('includes workspace directories that are symlinks, addressed by their link path', async () => {
    const root = mkTmp()
    touch(root, 'pnpm-workspace.yaml', 'packages:\n  - packages/*\n')
    touch(root, 'vendor/b/package.json', JSON.stringify({ name: 'b' }))
    touch(root, 'vendor/b/src/index.ts')
    mkdirSync(join(root, 'packages'))
    symlinkSync(join(root, 'vendor/b'), join(root, 'packages/b'), 'dir')

    const pkgs = await detectWorkspacePackages(root)

    expect(pkgs).toEqual([
      {
        name: 'b',
        srcDirAbs: join(root, 'packages/b/src'),
        entryFilesAbs: [join(root, 'packages/b/src/index.ts')],
      },
    ])
  })
})
