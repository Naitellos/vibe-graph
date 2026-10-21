/**
 * Regression test for the dist-resolution drift bug.
 *
 * In a workspace monorepo, a cross-package import (`import … from '@scope/pkg'`)
 * resolves — via the pnpm node_modules symlink + the package's `exports`/`types`
 * — to the *built* `dist/*.d.ts`, not to `src`. Because `dist/` is excluded from
 * indexing, that target is owned by no subsystem, so `semantic-collapse` drops
 * the import and `core/drift` falsely reports the (real) declared dependency as
 * `stale`.
 *
 * This builds the faithful topology — pkg-b imports pkg-a by its package name,
 * pkg-a is "built" (has dist), and pkg-b/node_modules/@fix/a symlinks to pkg-a —
 * then runs the real scan() pipeline and asserts the dependency is recognized.
 */

import { mkdir, mkdtemp, rm, symlink, writeFile } from 'node:fs/promises'
import { tmpdir } from 'node:os'
import { join } from 'node:path'
import { afterEach, beforeEach, describe, expect, it } from 'vitest'
import { scan } from './scan.js'

describe('scan() — workspace cross-package dependency resolution', () => {
  let tmpRoot: string

  beforeEach(async () => {
    tmpRoot = await mkdtemp(join(tmpdir(), 'vibegraph-ws-'))

    // ── Workspace root ───────────────────────────────────────────────────────
    await writeFile(
      join(tmpRoot, 'package.json'),
      JSON.stringify({ name: 'ws-root', version: '0.0.0', private: true }),
      'utf-8',
    )
    await writeFile(join(tmpRoot, 'pnpm-workspace.yaml'), "packages:\n  - 'packages/*'\n", 'utf-8')

    // ── packages/pkg-a — a BUILT library (has dist), source owned by subsystem a
    await mkdir(join(tmpRoot, 'packages/pkg-a/src'), { recursive: true })
    await mkdir(join(tmpRoot, 'packages/pkg-a/dist'), { recursive: true })
    await writeFile(
      join(tmpRoot, 'packages/pkg-a/package.json'),
      JSON.stringify({
        name: '@fix/a',
        version: '0.0.0',
        main: './dist/index.js',
        types: './dist/index.d.ts',
        exports: { '.': { import: './dist/index.js', types: './dist/index.d.ts' } },
      }),
      'utf-8',
    )
    await writeFile(join(tmpRoot, 'packages/pkg-a/src/index.ts'), 'export const a = 1\n', 'utf-8')
    // Built output — this is what module resolution actually lands on.
    await writeFile(join(tmpRoot, 'packages/pkg-a/dist/index.js'), 'export const a = 1\n', 'utf-8')
    await writeFile(
      join(tmpRoot, 'packages/pkg-a/dist/index.d.ts'),
      'export declare const a: number\n',
      'utf-8',
    )

    // ── packages/pkg-b — imports @fix/a by package name, source owned by subsystem b
    await mkdir(join(tmpRoot, 'packages/pkg-b/src'), { recursive: true })
    await writeFile(
      join(tmpRoot, 'packages/pkg-b/package.json'),
      JSON.stringify({
        name: '@fix/b',
        version: '0.0.0',
        dependencies: { '@fix/a': 'workspace:*' },
      }),
      'utf-8',
    )
    await writeFile(
      join(tmpRoot, 'packages/pkg-b/src/index.ts'),
      "import { a } from '@fix/a'\nexport const b = a + 1\n",
      'utf-8',
    )

    // ── pnpm-style symlink: packages/pkg-b/node_modules/@fix/a -> packages/pkg-a
    await mkdir(join(tmpRoot, 'packages/pkg-b/node_modules/@fix'), { recursive: true })
    await symlink(
      join(tmpRoot, 'packages/pkg-a'),
      join(tmpRoot, 'packages/pkg-b/node_modules/@fix/a'),
      'dir',
    )

    // ── Curated subsystem docs: b depends_on a (the declared, real dependency)
    await mkdir(join(tmpRoot, '.vibegraph/subsystems'), { recursive: true })
    await writeFile(
      join(tmpRoot, '.vibegraph/subsystems/a.yml'),
      'id: a\ntitle: Package A\nlayer: domain\nmatch:\n  - packages/pkg-a/**\n',
      'utf-8',
    )
    await writeFile(
      join(tmpRoot, '.vibegraph/subsystems/b.yml'),
      'id: b\ntitle: Package B\nlayer: domain\nmatch:\n  - packages/pkg-b/**\ndepends_on:\n  - a\n',
      'utf-8',
    )
  })

  afterEach(async () => {
    await rm(tmpRoot, { recursive: true, force: true })
  })

  it('does not flag a real cross-package workspace dependency as stale drift', async () => {
    const snap = await scan({ root: tmpRoot })

    // The AST import b -> a must collapse to a subsystem-level depends_on edge.
    const derived = snap.edges.find(
      (e) =>
        e.kind === 'depends_on' &&
        e.source === 'derived' &&
        e.from === 'subsystem:b' &&
        e.to === 'subsystem:a',
    )
    expect(derived).toBeDefined()

    // And therefore the declared dependency must NOT be reported as stale.
    const staleBtoA = snap.findings.find((f) => f.id === 'drift:stale:subsystem:b:subsystem:a')
    expect(staleBtoA).toBeUndefined()
  })
})
