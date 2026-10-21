import { mkdir, mkdtemp, rm, writeFile } from 'node:fs/promises'
import { tmpdir } from 'node:os'
import { join } from 'node:path'
/**
 * Invariant: subsystem-doc loader guards against silent overwrites.
 *
 * Product principle: "Subsystem docs are immutable by filename."
 * The loader enforces that:
 * - Each .yml file's basename must match its declared id (ID_MISMATCH guard)
 * - No two files can declare the same id (DUPLICATE_ID guard)
 *
 * This prevents accidental overwrites where a user might:
 * 1. Create `alpha.yml` with id: alpha
 * 2. Later try to refine and accidentally create `beta.yml` with id: alpha
 *    (forgetting to update the id in the new file)
 *
 * The refine-mode workflow must explicitly use --refine flag to allow
 * legitimate overwrites of identical content (idempotent rewrites).
 *
 * This test verifies the guards work at the integration level.
 */
import { afterEach, beforeEach, describe, expect, it } from 'vitest'
import { LoaderError, loadSubsystemDocs } from '../../packages/core/src/config/subsystems-loader.js'

describe('invariant: subsystem-doc loader guards against silent overwrites', () => {
  let tmpRoot: string
  beforeEach(async () => {
    tmpRoot = await mkdtemp(join(tmpdir(), 'vg-overwrite-invariant-'))
  })
  afterEach(async () => {
    await rm(tmpRoot, { recursive: true, force: true })
  })

  it('two .yml files declaring the same id → loadSubsystemDocs throws DUPLICATE_ID', async () => {
    const dir = join(tmpRoot, '.vibegraph', 'subsystems')
    await mkdir(dir, { recursive: true })
    await writeFile(
      join(dir, 'first.yml'),
      'id: same\ntitle: First\nlayer: domain\nmatch: src/**\n',
    )
    await writeFile(
      join(dir, 'second.yml'),
      'id: same\ntitle: Second\nlayer: domain\nmatch: src/**\n',
    )

    let err: unknown
    try {
      await loadSubsystemDocs(tmpRoot)
    } catch (e) {
      err = e
    }
    expect(err).toBeInstanceOf(LoaderError)
    expect((err as LoaderError).code).toBe('DUPLICATE_ID')
  })

  it('filename ≠ id → loadSubsystemDocs throws ID_MISMATCH', async () => {
    const dir = join(tmpRoot, '.vibegraph', 'subsystems')
    await mkdir(dir, { recursive: true })
    await writeFile(
      join(dir, 'expected-slug.yml'),
      'id: different-slug\ntitle: X\nlayer: domain\nmatch: src/**\n',
    )

    let err: unknown
    try {
      await loadSubsystemDocs(tmpRoot)
    } catch (e) {
      err = e
    }
    expect(err).toBeInstanceOf(LoaderError)
    expect((err as LoaderError).code).toBe('ID_MISMATCH')
  })

  it('idempotent rewrite of identical content is safe (no error)', async () => {
    const dir = join(tmpRoot, '.vibegraph', 'subsystems')
    await mkdir(dir, { recursive: true })
    const content = 'id: alpha\ntitle: Alpha\nlayer: domain\nmatch: src/**\n'
    await writeFile(join(dir, 'alpha.yml'), content)

    // First load
    const first = await loadSubsystemDocs(tmpRoot)
    expect(first.docs).toHaveLength(1)

    // Rewrite same content (simulates a refine-mode legitimate overwrite)
    await writeFile(join(dir, 'alpha.yml'), content)

    // Second load still succeeds
    const second = await loadSubsystemDocs(tmpRoot)
    expect(second.docs).toHaveLength(1)
    expect(second.docs[0]?.id).toBe('alpha')
  })
})
