import { mkdirSync, mkdtempSync, realpathSync, symlinkSync, writeFileSync } from 'node:fs'
import { tmpdir } from 'node:os'
import { dirname, join } from 'node:path'
import { pino } from 'pino'
import { describe, expect, it } from 'vitest'
import { DEFAULT_CONFIG } from '../config/config-yml.js'
import { corePackagesAnalyzer } from './core-packages.js'
import { createIgnoreMatcher } from './ignore-matcher.js'
import type { ProgramManager } from './program-manager.js'

function mkTmp(): string {
  return realpathSync(mkdtempSync(join(tmpdir(), 'vg-core-packages-')))
}

function touch(root: string, relPath: string, body = '') {
  const abs = join(root, relPath)
  mkdirSync(dirname(abs), { recursive: true })
  writeFileSync(abs, body)
}

function makeCtx(root: string) {
  const programs: ProgramManager = {
    getProgramForFile: () => ({}) as never,
    getAllPrograms: () => [],
  }
  const ignore = createIgnoreMatcher({ patterns: [], includeDefaults: false })
  const log = pino({ level: 'silent' })
  return { projectRoot: root, files: [] as string[], programs, ignore, log, config: DEFAULT_CONFIG }
}

describe('corePackagesAnalyzer', () => {
  it('has correct id and description', () => {
    expect(corePackagesAnalyzer.id).toBe('core/packages')
    expect(typeof corePackagesAnalyzer.description).toBe('string')
    expect(corePackagesAnalyzer.description.length).toBeGreaterThan(0)
  })

  it('returns empty result when root package.json is absent', async () => {
    const root = mkTmp()
    const result = await corePackagesAnalyzer.run(makeCtx(root))
    expect(result.nodes).toEqual([])
    expect(result.edges).toEqual([])
    expect(result.evidence).toEqual([])
  })

  it('handles monorepo: 2 workspaces + 3 deduped external deps → 5 nodes', async () => {
    const root = mkTmp()

    // Root container (not emitted as a package node)
    touch(root, 'package.json', JSON.stringify({ name: 'mono-root', workspaces: ['packages/*'] }))

    // Workspace A
    touch(
      root,
      'packages/a/package.json',
      JSON.stringify({
        name: '@org/a',
        dependencies: { react: '^18', lodash: '^4' },
      }),
    )

    // Workspace B
    touch(
      root,
      'packages/b/package.json',
      JSON.stringify({
        name: '@org/b',
        dependencies: { react: '^18', zod: '^3' },
      }),
    )

    const result = await corePackagesAnalyzer.run(makeCtx(root))

    expect(result.nodes).toHaveLength(5)
    expect(result.edges).toEqual([])
    expect(result.evidence).toEqual([])

    // Package nodes
    const pkgA = result.nodes.find((n) => n.id === 'package:@org/a')
    expect(pkgA).toBeDefined()
    expect(pkgA?.kind).toBe('package')
    expect(pkgA?.title).toBe('@org/a')

    const pkgB = result.nodes.find((n) => n.id === 'package:@org/b')
    expect(pkgB).toBeDefined()
    expect(pkgB?.kind).toBe('package')
    expect(pkgB?.title).toBe('@org/b')

    // External nodes (react deduped)
    const extReact = result.nodes.find((n) => n.id === 'external:react')
    expect(extReact).toBeDefined()
    expect(extReact?.kind).toBe('external')
    expect(extReact?.title).toBe('react')

    const extLodash = result.nodes.find((n) => n.id === 'external:lodash')
    expect(extLodash).toBeDefined()
    expect(extLodash?.kind).toBe('external')

    const extZod = result.nodes.find((n) => n.id === 'external:zod')
    expect(extZod).toBeDefined()
    expect(extZod?.kind).toBe('external')

    // Root itself is NOT emitted
    expect(result.nodes.find((n) => n.id === 'package:mono-root')).toBeUndefined()
  })

  it('handles single-package mode: 1 package + 1 external → 2 nodes', async () => {
    const root = mkTmp()

    touch(
      root,
      'package.json',
      JSON.stringify({
        name: 'single',
        dependencies: { foo: '^1' },
      }),
    )

    const result = await corePackagesAnalyzer.run(makeCtx(root))

    expect(result.nodes).toHaveLength(2)

    const pkgNode = result.nodes.find((n) => n.id === 'package:single')
    expect(pkgNode).toBeDefined()
    expect(pkgNode?.kind).toBe('package')
    expect(pkgNode?.title).toBe('single')

    const extFoo = result.nodes.find((n) => n.id === 'external:foo')
    expect(extFoo).toBeDefined()
    expect(extFoo?.kind).toBe('external')
    expect(extFoo?.title).toBe('foo')
  })

  it('skips workspace dirs that have no package.json', async () => {
    const root = mkTmp()

    touch(root, 'package.json', JSON.stringify({ name: 'mono', workspaces: ['packages/*'] }))
    touch(root, 'packages/a/package.json', JSON.stringify({ name: '@org/a' }))
    // packages/b exists as a dir but has no package.json — created via nested file trick
    touch(root, 'packages/b/readme.txt', 'no pkg here')

    const result = await corePackagesAnalyzer.run(makeCtx(root))

    // Only 1 package node (a), no crash from b
    expect(result.nodes.filter((n) => n.kind === 'package')).toHaveLength(1)
    expect(result.nodes.find((n) => n.id === 'package:@org/a')).toBeDefined()
  })

  it('skips internal workspace deps from external nodes', async () => {
    const root = mkTmp()

    touch(root, 'package.json', JSON.stringify({ name: 'mono', workspaces: ['packages/*'] }))
    touch(
      root,
      'packages/a/package.json',
      JSON.stringify({
        name: '@org/a',
        dependencies: { '@org/b': 'workspace:*', react: '^18' },
      }),
    )
    touch(root, 'packages/b/package.json', JSON.stringify({ name: '@org/b' }))

    const result = await corePackagesAnalyzer.run(makeCtx(root))

    // @org/b is a workspace package — should NOT appear as external
    expect(result.nodes.find((n) => n.id === 'external:@org/b')).toBeUndefined()
    // react is genuinely external
    expect(result.nodes.find((n) => n.id === 'external:react')).toBeDefined()
  })

  it('handles workspaces field as object with packages key', async () => {
    const root = mkTmp()

    touch(
      root,
      'package.json',
      JSON.stringify({ name: 'mono', workspaces: { packages: ['packages/*'] } }),
    )
    touch(root, 'packages/a/package.json', JSON.stringify({ name: '@org/a' }))

    const result = await corePackagesAnalyzer.run(makeCtx(root))

    expect(result.nodes.find((n) => n.id === 'package:@org/a')).toBeDefined()
  })

  it('collects deps from all dep fields (dev, peer, optional)', async () => {
    const root = mkTmp()

    touch(
      root,
      'package.json',
      JSON.stringify({
        name: 'single',
        dependencies: { a: '^1' },
        devDependencies: { b: '^2' },
        peerDependencies: { c: '^3' },
        optionalDependencies: { d: '^4' },
      }),
    )

    const result = await corePackagesAnalyzer.run(makeCtx(root))

    const ids = result.nodes.map((n) => n.id)
    expect(ids).toContain('external:a')
    expect(ids).toContain('external:b')
    expect(ids).toContain('external:c')
    expect(ids).toContain('external:d')
  })

  it('resolves a literal workspace entry to that directory only, not its subdirectories', async () => {
    const root = mkTmp()

    touch(root, 'package.json', JSON.stringify({ name: 'mono', workspaces: ['tools'] }))
    touch(root, 'tools/package.json', JSON.stringify({ name: 'tools' }))
    touch(root, 'tools/fixtures/demo/package.json', JSON.stringify({ name: 'demo-fixture' }))

    const result = await corePackagesAnalyzer.run(makeCtx(root))

    const pkgIds = result.nodes.filter((n) => n.kind === 'package').map((n) => n.id)
    expect(pkgIds).toEqual(['package:tools'])
  })

  it('names a nameless workspace package after its directory, without a trailing slash', async () => {
    const root = mkTmp()

    touch(root, 'package.json', JSON.stringify({ name: 'mono', workspaces: ['packages/*'] }))
    touch(root, 'packages/noname/package.json', JSON.stringify({}))

    const result = await corePackagesAnalyzer.run(makeCtx(root))

    const pkgIds = result.nodes.filter((n) => n.kind === 'package').map((n) => n.id)
    expect(pkgIds).toEqual(['package:packages/noname'])
  })

  it('expands braces, honors negated workspace globs, and skips dot directories', async () => {
    const root = mkTmp()

    touch(
      root,
      'package.json',
      JSON.stringify({ name: 'mono', workspaces: ['{apps,libs}/*', '!libs/legacy'] }),
    )
    touch(root, 'apps/web/package.json', JSON.stringify({ name: 'web' }))
    touch(root, 'apps/.template/package.json', JSON.stringify({ name: 'template' }))
    touch(root, 'libs/ui/package.json', JSON.stringify({ name: 'ui' }))
    touch(root, 'libs/legacy/package.json', JSON.stringify({ name: 'legacy' }))

    const result = await corePackagesAnalyzer.run(makeCtx(root))

    const pkgIds = result.nodes
      .filter((n) => n.kind === 'package')
      .map((n) => n.id)
      .sort()
    expect(pkgIds).toEqual(['package:ui', 'package:web'])
  })

  it('includes workspace directories that are symlinks', async () => {
    const root = mkTmp()

    touch(root, 'package.json', JSON.stringify({ name: 'mono', workspaces: ['packages/*'] }))
    touch(root, 'packages/a/package.json', JSON.stringify({ name: 'a' }))
    touch(root, 'vendor/b/package.json', JSON.stringify({ name: 'b' }))
    symlinkSync(join(root, 'vendor/b'), join(root, 'packages/b'), 'dir')

    const result = await corePackagesAnalyzer.run(makeCtx(root))

    const pkgIds = result.nodes
      .filter((n) => n.kind === 'package')
      .map((n) => n.id)
      .sort()
    expect(pkgIds).toEqual(['package:a', 'package:b'])
  })

  it('a trailing ** workspace glob matches directories below its base, not the base itself', async () => {
    const root = mkTmp()

    touch(root, 'package.json', JSON.stringify({ name: 'mono', workspaces: ['packages/**'] }))
    touch(root, 'packages/package.json', JSON.stringify({ name: 'packages-base' }))
    touch(root, 'packages/a/package.json', JSON.stringify({ name: 'a' }))
    touch(root, 'packages/a/plugins/p/package.json', JSON.stringify({ name: 'p' }))

    const result = await corePackagesAnalyzer.run(makeCtx(root))

    const pkgIds = result.nodes
      .filter((n) => n.kind === 'package')
      .map((n) => n.id)
      .sort()
    expect(pkgIds).toEqual(['package:a', 'package:p'])
  })

  it('a negated workspace directory also excludes everything below it', async () => {
    const root = mkTmp()

    touch(
      root,
      'package.json',
      JSON.stringify({ name: 'mono', workspaces: ['packages/**', '!packages/legacy'] }),
    )
    touch(root, 'packages/a/package.json', JSON.stringify({ name: 'a' }))
    touch(root, 'packages/legacy/package.json', JSON.stringify({ name: 'legacy' }))
    touch(root, 'packages/legacy/inner/package.json', JSON.stringify({ name: 'legacy-inner' }))

    const result = await corePackagesAnalyzer.run(makeCtx(root))

    const pkgIds = result.nodes.filter((n) => n.kind === 'package').map((n) => n.id)
    expect(pkgIds).toEqual(['package:a'])
  })
})
