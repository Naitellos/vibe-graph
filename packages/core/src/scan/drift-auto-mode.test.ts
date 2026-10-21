/**
 * Drift is a curated-YAML feature. Spec §9 migration State A/B:
 * "drift detection works only with curated YAML." In auto-detect / inline
 * modes (no SubsystemDoc YAMLs) there are no declarations to drift-check, so
 * scan() must not emit any `domain: 'drift'` findings — they would be noise
 * and contradict the cockpit's own "works only with curated YAML" banner.
 *
 * Both fixtures have a real cross-package import (beta → alpha) that resolves
 * to source, so a derived subsystem dependency exists in both. The only
 * difference is whether curated SubsystemDoc YAMLs are present.
 */

import { mkdir, mkdtemp, rm, writeFile } from 'node:fs/promises'
import { tmpdir } from 'node:os'
import { join } from 'node:path'
import { afterEach, beforeEach, describe, expect, it } from 'vitest'
import { scan } from './scan.js'

async function buildWorkspace(root: string, opts: { curated: boolean }): Promise<void> {
  await writeFile(
    join(root, 'package.json'),
    JSON.stringify({ name: 'ws-root', version: '0.0.0', private: true }),
    'utf-8',
  )
  await writeFile(join(root, 'pnpm-workspace.yaml'), "packages:\n  - 'packages/*'\n", 'utf-8')

  await mkdir(join(root, 'packages/alpha/src'), { recursive: true })
  await writeFile(
    join(root, 'packages/alpha/package.json'),
    JSON.stringify({ name: '@fix/alpha', version: '0.0.0' }),
    'utf-8',
  )
  await writeFile(join(root, 'packages/alpha/src/index.ts'), 'export const a = 1\n', 'utf-8')

  await mkdir(join(root, 'packages/beta/src'), { recursive: true })
  await writeFile(
    join(root, 'packages/beta/package.json'),
    JSON.stringify({
      name: '@fix/beta',
      version: '0.0.0',
      dependencies: { '@fix/alpha': 'workspace:*' },
    }),
    'utf-8',
  )
  await writeFile(
    join(root, 'packages/beta/src/index.ts'),
    "import { a } from '@fix/alpha'\nexport const b = a\n",
    'utf-8',
  )

  if (opts.curated) {
    await mkdir(join(root, '.vibegraph/subsystems'), { recursive: true })
    await writeFile(
      join(root, '.vibegraph/subsystems/alpha.yml'),
      'id: alpha\ntitle: Alpha\nlayer: domain\nmatch:\n  - packages/alpha/**\n',
      'utf-8',
    )
    // beta intentionally does NOT declare depends_on alpha — the real import is
    // therefore "undeclared" drift, which must surface in curated mode.
    await writeFile(
      join(root, '.vibegraph/subsystems/beta.yml'),
      'id: beta\ntitle: Beta\nlayer: domain\nmatch:\n  - packages/beta/**\n',
      'utf-8',
    )
  }
}

describe('scan() — drift gated to curated projects', () => {
  let tmpRoot: string

  beforeEach(async () => {
    tmpRoot = await mkdtemp(join(tmpdir(), 'vibegraph-drift-'))
  })

  afterEach(async () => {
    await rm(tmpRoot, { recursive: true, force: true })
  })

  it('auto-detect mode (no curated docs): emits no drift findings', async () => {
    await buildWorkspace(tmpRoot, { curated: false })
    const snap = await scan({ root: tmpRoot })

    // The real cross-package dependency is still detected...
    const derived = snap.edges.find(
      (e) =>
        e.kind === 'depends_on' &&
        e.source === 'derived' &&
        e.from === 'subsystem:@fix/beta' &&
        e.to === 'subsystem:@fix/alpha',
    )
    expect(derived).toBeDefined()

    // ...but no drift findings are produced without curated YAML.
    const drift = snap.findings.filter((f) => f.domain === 'drift')
    expect(drift).toEqual([])
  })

  it('curated mode: still emits drift findings (undeclared dependency)', async () => {
    await buildWorkspace(tmpRoot, { curated: true })
    const snap = await scan({ root: tmpRoot })

    // beta imports alpha but does not declare it → undeclared drift.
    const undeclared = snap.findings.find(
      (f) => f.id === 'drift:undeclared:subsystem:beta:subsystem:alpha',
    )
    expect(undeclared).toBeDefined()
  })
})
