import { mkdirSync, mkdtempSync, realpathSync, writeFileSync } from 'node:fs'
import { tmpdir } from 'node:os'
import { join } from 'node:path'
import { describe, expect, it } from 'vitest'
import ts = require('typescript')
import {
  applyWorkspacePaths,
  createProgramManager,
  ensureUsableModuleResolution,
} from './program-manager.js'
import type { WorkspacePackage } from './workspace-paths.js'

const pkg: WorkspacePackage = {
  name: '@scope/pkg',
  entryFilesAbs: ['/repo/packages/pkg/src/index.ts'],
  srcDirAbs: '/repo/packages/pkg/src',
}

describe('applyWorkspacePaths', () => {
  it('does not introduce a baseUrl and uses absolute path values', () => {
    // A baseUrl would hijack bare specifiers (e.g. `import "react"`) to the
    // project root; absolute `paths` values resolve without one.
    const out = applyWorkspacePaths({ allowJs: true }, '/repo', [pkg])
    expect(out.baseUrl).toBeUndefined()
    expect(out.paths?.['@scope/pkg']).toEqual(['/repo/packages/pkg/src/index.ts'])
    expect(out.paths?.['@scope/pkg/*']).toEqual(['/repo/packages/pkg/src/*'])
  })

  it('preserves an existing baseUrl without overwriting it', () => {
    const out = applyWorkspacePaths({ baseUrl: '/repo/elsewhere' }, '/repo', [pkg])
    expect(out.baseUrl).toBe('/repo/elsewhere')
    expect(out.paths?.['@scope/pkg']).toEqual(['/repo/packages/pkg/src/index.ts'])
  })

  it('does not override a user wildcard path that already covers the package', () => {
    const out = applyWorkspacePaths({ paths: { '@scope/*': ['custom/*'] } }, '/repo', [pkg])
    // The synthesized exact key would out-prioritize the user wildcard — skip it.
    expect(out.paths?.['@scope/pkg']).toBeUndefined()
    expect(out.paths?.['@scope/pkg/*']).toBeUndefined()
    expect(out.paths?.['@scope/*']).toEqual(['custom/*'])
  })

  it('synthesizes paths for packages not covered by user paths', () => {
    const out = applyWorkspacePaths({ paths: { '@other/*': ['x/*'] } }, '/repo', [pkg])
    expect(out.paths?.['@scope/pkg']).toEqual(['/repo/packages/pkg/src/index.ts'])
    expect(out.paths?.['@other/*']).toEqual(['x/*'])
  })

  it('returns options unchanged when there are no workspace packages', () => {
    const input = { allowJs: true, paths: { '@a/*': ['b/*'] } }
    expect(applyWorkspacePaths(input, '/repo', [])).toBe(input)
  })
})

function mkTmp(): string {
  return realpathSync(mkdtempSync(join(tmpdir(), 'vg-pm-')))
}

describe('createProgramManager', () => {
  it('creates a program from a tsconfig.json', async () => {
    const root = mkTmp()
    writeFileSync(
      join(root, 'tsconfig.json'),
      JSON.stringify({ compilerOptions: { strict: true }, include: ['src/**/*'] }),
    )
    mkdirSync(join(root, 'src'))
    writeFileSync(join(root, 'src/a.ts'), 'export const a = 1\n')

    const pm = await createProgramManager({ projectRoot: root, files: [join(root, 'src/a.ts')] })
    const program = pm.getProgramForFile(join(root, 'src/a.ts'))
    expect(program.getSourceFile(join(root, 'src/a.ts'))).toBeDefined()
    expect(pm.getAllPrograms()).toHaveLength(1)
  })

  it('creates a synthetic program when no tsconfig.json present (JS-only mode)', async () => {
    const root = mkTmp()
    writeFileSync(join(root, 'a.js'), 'module.exports = 1\n')

    const pm = await createProgramManager({ projectRoot: root, files: [join(root, 'a.js')] })
    expect(pm.getProgramForFile(join(root, 'a.js'))).toBeDefined()
  })
})

describe('ensureUsableModuleResolution', () => {
  it('leaves an explicit moduleResolution untouched', () => {
    const out = ensureUsableModuleResolution({
      moduleResolution: ts.ModuleResolutionKind.NodeNext,
      module: ts.ModuleKind.NodeNext,
    })
    expect(out.moduleResolution).toBe(ts.ModuleResolutionKind.NodeNext)
    expect(out.module).toBe(ts.ModuleKind.NodeNext)
  })

  // A solution-style tsconfig ({files:[], references:[…]}) carries no
  // compilerOptions, and an `extends` that cannot be resolved (a package extends
  // before `npm install`) yields the same empty set. TypeScript then resolves
  // almost nothing and the scan reports success on a collapsed graph — measured on
  // hono: 61 import edges instead of 1008.
  it('supplies a usable default when the config resolved to nothing', () => {
    const out = ensureUsableModuleResolution({})
    expect(out.moduleResolution).toBe(ts.ModuleResolutionKind.Bundler)
    expect(out.target).toBe(ts.ScriptTarget.ES2022)
    expect(out.allowJs).toBe(true)
  })

  it('does not clobber other options the user did set', () => {
    const out = ensureUsableModuleResolution({ strict: true, jsx: ts.JsxEmit.ReactJSX })
    expect(out.strict).toBe(true)
    expect(out.jsx).toBe(ts.JsxEmit.ReactJSX)
    expect(out.moduleResolution).toBe(ts.ModuleResolutionKind.Bundler)
  })
})

describe('createProgramManager with project references', () => {
  // Passing `projectReferences` makes TypeScript redirect files owned by a
  // referenced project to that project's BUILD OUTPUT. vibe-graph never builds
  // anything, so those outputs do not exist and the files silently vanish from the
  // Program. Measured on hono: 32 of 360 root files survived, 38 relative imports
  // instead of 945 — a 96% loss, reported as a successful scan.
  it('indexes source files even when the root config is solution-style', async () => {
    const root = realpathSync(mkdtempSync(join(tmpdir(), 'vg-refs-')))
    mkdirSync(join(root, 'src'), { recursive: true })
    writeFileSync(
      join(root, 'tsconfig.json'),
      JSON.stringify({ files: [], references: [{ path: './tsconfig.build.json' }] }),
    )
    writeFileSync(
      join(root, 'tsconfig.build.json'),
      JSON.stringify({
        compilerOptions: { outDir: './dist', module: 'esnext', moduleResolution: 'bundler' },
        include: ['src'],
      }),
    )
    writeFileSync(join(root, 'src/util.ts'), 'export const one = 1\n')
    // extensionless relative specifier, the common style in such repos
    writeFileSync(
      join(root, 'src/main.ts'),
      "import { one } from './util'\nexport const two = one + 1\n",
    )

    const files = [join(root, 'src/util.ts'), join(root, 'src/main.ts')]
    const mgr = await createProgramManager({ projectRoot: root, files })
    const program = mgr.getProgramForFile(files[1] as string)
    const indexed = program
      .getSourceFiles()
      .map((s) => s.fileName)
      .filter((f) => f.startsWith(root) && !f.includes('node_modules'))

    expect(indexed).toHaveLength(2)
    const main = program.getSourceFile(files[1] as string)
    expect(main).toBeDefined()
  })
})

describe('createProgramManager with an umbrella root tsconfig', () => {
  // `core-ts-imports` iterates `ctx.files` and silently `continue`s on any file the
  // Program has no SourceFile for. So the Program MUST be a superset of the files
  // vibe-graph discovered, or those files contribute zero edges while still
  // appearing as nodes — a scan that reports success on a collapsed graph.
  //
  // Seeding rootNames from the root tsconfig's own `fileNames` breaks that
  // invariant whenever the root config is an umbrella that deliberately compiles
  // almost nothing (real code being owned by per-package configs). Measured:
  // TanStack/query ships `"include": ["*.config.*"]` → 2 of 1109 discovered files
  // in the Program, 3 import edges; payload's root include misses its whole tree
  // → 6 of 7001, 15 edges.
  it('indexes discovered files the root config does not include', async () => {
    const root = mkTmp()
    mkdirSync(join(root, 'src'), { recursive: true })
    // query's exact shape: the root config owns only its own config files.
    writeFileSync(
      join(root, 'tsconfig.json'),
      JSON.stringify({
        compilerOptions: { allowJs: true, module: 'esnext', moduleResolution: 'bundler' },
        include: ['*.config.*'],
      }),
    )
    writeFileSync(join(root, 'eslint.config.js'), 'export default []\n')
    writeFileSync(join(root, 'src/util.ts'), 'export const one = 1\n')
    writeFileSync(
      join(root, 'src/main.ts'),
      "import { one } from './util'\nexport const two = one + 1\n",
    )

    const files = [join(root, 'src/util.ts'), join(root, 'src/main.ts')]
    const mgr = await createProgramManager({ projectRoot: root, files })
    const program = mgr.getProgramForFile(files[0] as string)

    // The invariant: every file handed to the manager is resolvable in the Program.
    for (const f of files) {
      expect(program.getSourceFile(f), `${f} missing from Program`).toBeDefined()
    }
  })

  it('still indexes files the config lists but discovery did not hand it', async () => {
    // The config's own fileNames must not be *lost* either — ambient/generated
    // declarations a user config lists are legitimate resolution targets.
    const root = mkTmp()
    mkdirSync(join(root, 'src'), { recursive: true })
    writeFileSync(
      join(root, 'tsconfig.json'),
      JSON.stringify({
        compilerOptions: { allowJs: true, module: 'esnext', moduleResolution: 'bundler' },
        include: ['*.config.*'],
      }),
    )
    writeFileSync(join(root, 'eslint.config.js'), 'export default []\n')
    writeFileSync(join(root, 'src/util.ts'), 'export const one = 1\n')

    const mgr = await createProgramManager({
      projectRoot: root,
      files: [join(root, 'src/util.ts')],
    })
    const program = mgr.getAllPrograms()[0] as ts.Program
    expect(program.getSourceFile(join(root, 'eslint.config.js'))).toBeDefined()
    expect(program.getSourceFile(join(root, 'src/util.ts'))).toBeDefined()
  })
})
