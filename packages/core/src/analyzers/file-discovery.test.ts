import { mkdirSync, mkdtempSync, realpathSync, symlinkSync, writeFileSync } from 'node:fs'
import { tmpdir } from 'node:os'
import { dirname, join } from 'node:path'
import { describe, expect, it } from 'vitest'
import { discoverFiles } from './file-discovery.js'
import { createIgnoreMatcher } from './ignore-matcher.js'

function mkTmp(): string {
  return realpathSync(mkdtempSync(join(tmpdir(), 'vg-discover-')))
}

function touch(root: string, relPath: string, body = '') {
  const abs = join(root, relPath)
  mkdirSync(dirname(abs), { recursive: true })
  writeFileSync(abs, body)
}

describe('discoverFiles', () => {
  it('finds .ts/.tsx/.js/.jsx/.mjs/.cjs and respects ignore', async () => {
    const root = mkTmp()
    touch(root, 'src/a.ts')
    touch(root, 'src/b.tsx')
    touch(root, 'src/c.js')
    touch(root, 'src/d.mjs')
    touch(root, 'node_modules/x.ts')
    touch(root, 'src/keep.txt')
    touch(root, 'dist/built.js')

    const ignore = createIgnoreMatcher({ patterns: [], includeDefaults: true })
    const files = await discoverFiles({ projectRoot: root, ignore })

    const rels = files.map((f) => f.replace(`${root}/`, '')).sort()
    expect(rels).toEqual(['src/a.ts', 'src/b.tsx', 'src/c.js', 'src/d.mjs'])
  })

  it('honors negation (e.g. logs ignored except important.ts)', async () => {
    const root = mkTmp()
    touch(root, 'logs/x.ts')
    touch(root, 'logs/important.ts')

    const ignore = createIgnoreMatcher({
      patterns: ['logs/**', '!logs/important.ts'],
      includeDefaults: true,
    })
    const files = await discoverFiles({ projectRoot: root, ignore })
    const rels = files.map((f) => f.replace(`${root}/`, '')).sort()
    expect(rels).toEqual(['logs/important.ts'])
  })

  it('honors a root-anchored ignore pattern without dropping same-named nested dirs', async () => {
    const root = mkTmp()
    touch(root, 'generated/x.ts')
    touch(root, 'src/generated/y.ts')
    touch(root, 'src/a.ts')

    const ignore = createIgnoreMatcher({ patterns: ['/generated'], includeDefaults: true })
    const files = await discoverFiles({ projectRoot: root, ignore })
    const rels = files.map((f) => f.replace(`${root}/`, '')).sort()
    expect(rels).toEqual(['src/a.ts', 'src/generated/y.ts'])
  })

  it('returns absolute paths under the project root', async () => {
    const root = mkTmp()
    touch(root, 'src/a.ts')
    touch(root, 'index.js')

    const ignore = createIgnoreMatcher({ patterns: [], includeDefaults: true })
    const files = await discoverFiles({ projectRoot: root, ignore })

    expect(files.sort()).toEqual([join(root, 'index.js'), join(root, 'src/a.ts')])
  })

  it('skips dotfiles and dot directories', async () => {
    const root = mkTmp()
    touch(root, 'src/ok.ts')
    touch(root, 'src/.hidden.ts')
    touch(root, '.storybook/main.ts')
    touch(root, 'src/.generated/types.ts')

    const ignore = createIgnoreMatcher({ patterns: [], includeDefaults: true })
    const files = await discoverFiles({ projectRoot: root, ignore })
    const rels = files.map((f) => f.replace(`${root}/`, '')).sort()
    expect(rels).toEqual(['src/ok.ts'])
  })

  it('drops nested ignored directories that the coarse pass only prunes at the top level', async () => {
    const root = mkTmp()
    touch(root, 'packages/a/src/index.ts')
    touch(root, 'packages/a/node_modules/dep/index.js')
    touch(root, 'packages/a/dist/index.js')

    const ignore = createIgnoreMatcher({ patterns: [], includeDefaults: true })
    const files = await discoverFiles({ projectRoot: root, ignore })
    const rels = files.map((f) => f.replace(`${root}/`, '')).sort()
    expect(rels).toEqual(['packages/a/src/index.ts'])
  })

  it('follows symlinked directories and reports files under the link path', async () => {
    const root = mkTmp()
    touch(root, 'shared/util.ts')
    mkdirSync(join(root, 'src'), { recursive: true })
    symlinkSync(join(root, 'shared'), join(root, 'src/linked'), 'dir')

    const ignore = createIgnoreMatcher({ patterns: [], includeDefaults: true })
    const files = await discoverFiles({ projectRoot: root, ignore })
    const rels = files.map((f) => f.replace(`${root}/`, '')).sort()
    expect(rels).toEqual(['shared/util.ts', 'src/linked/util.ts'])
  })
})
