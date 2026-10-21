/**
 * The semantic-collapse match-glob fallback must also honor inline subsystems
 * declared in .vibegraph/config.yml (not only curated .vibegraph/subsystems/*.yml).
 *
 * Setup: a workspace where pkg-a ships only built `dist` (no `src` entry, so
 * workspace-path synthesis can't map it), and pkg-b imports it by name. The
 * import resolves to pkg-a's dist `.d.ts` — an unowned file — so the derived
 * subsystem dependency can only be recovered via the match-glob fallback, which
 * needs the inline subsystems' `match` globs threaded into collapse.
 */

import { mkdir, mkdtemp, rm, symlink, writeFile } from 'node:fs/promises'
import { tmpdir } from 'node:os'
import { join } from 'node:path'
import { afterEach, beforeEach, describe, expect, it } from 'vitest'
import { scan } from './scan.js'

describe('scan() — inline-config subsystems feed the collapse fallback', () => {
  let tmpRoot: string

  beforeEach(async () => {
    tmpRoot = await mkdtemp(join(tmpdir(), 'vibegraph-inline-'))

    await writeFile(
      join(tmpRoot, 'package.json'),
      JSON.stringify({ name: 'ws-root', version: '0.0.0', private: true }),
      'utf-8',
    )
    await writeFile(join(tmpRoot, 'pnpm-workspace.yaml'), "packages:\n  - 'packages/*'\n", 'utf-8')

    // pkg-a: only built output, NO src entry → not mappable via synthesized paths.
    await mkdir(join(tmpRoot, 'packages/pkg-a/dist'), { recursive: true })
    await writeFile(
      join(tmpRoot, 'packages/pkg-a/package.json'),
      JSON.stringify({
        name: '@fix/alpha',
        version: '0.0.0',
        exports: { '.': { import: './dist/index.js', types: './dist/index.d.ts' } },
      }),
      'utf-8',
    )
    await writeFile(join(tmpRoot, 'packages/pkg-a/dist/index.js'), 'export const a = 1\n', 'utf-8')
    await writeFile(
      join(tmpRoot, 'packages/pkg-a/dist/index.d.ts'),
      'export declare const a: number\n',
      'utf-8',
    )

    // pkg-b: imports @fix/alpha by name.
    await mkdir(join(tmpRoot, 'packages/pkg-b/src'), { recursive: true })
    await writeFile(
      join(tmpRoot, 'packages/pkg-b/package.json'),
      JSON.stringify({
        name: '@fix/beta',
        version: '0.0.0',
        dependencies: { '@fix/alpha': 'workspace:*' },
      }),
      'utf-8',
    )
    await writeFile(
      join(tmpRoot, 'packages/pkg-b/src/index.ts'),
      "import { a } from '@fix/alpha'\nexport const b = a + 1\n",
      'utf-8',
    )
    await mkdir(join(tmpRoot, 'packages/pkg-b/node_modules/@fix'), { recursive: true })
    await symlink(
      join(tmpRoot, 'packages/pkg-a'),
      join(tmpRoot, 'packages/pkg-b/node_modules/@fix/alpha'),
      'dir',
    )

    // Inline subsystems in config.yml (NOT curated subsystems/*.yml).
    await mkdir(join(tmpRoot, '.vibegraph'), { recursive: true })
    await writeFile(
      join(tmpRoot, '.vibegraph/config.yml'),
      [
        'project:',
        '  name: inline-fixture',
        'subsystemDetection:',
        '  mode: manual',
        'subsystems:',
        '  - id: a',
        '    title: Alpha',
        '    match:',
        '      - packages/pkg-a/**',
        '  - id: b',
        '    title: Beta',
        '    match:',
        '      - packages/pkg-b/**',
        '',
      ].join('\n'),
      'utf-8',
    )
  })

  afterEach(async () => {
    await rm(tmpRoot, { recursive: true, force: true })
  })

  it('recovers the cross-package dependency via inline subsystem match globs', async () => {
    const snap = await scan({ root: tmpRoot })

    const derived = snap.edges.find(
      (e) =>
        e.kind === 'depends_on' &&
        e.source === 'derived' &&
        e.from === 'subsystem:b' &&
        e.to === 'subsystem:a',
    )
    expect(derived).toBeDefined()
  })
})
