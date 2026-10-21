import { mkdir, mkdtemp, rm, writeFile } from 'node:fs/promises'
import { tmpdir } from 'node:os'
import { join } from 'node:path'
import { afterEach, beforeEach, describe, expect, it } from 'vitest'
import { LoaderError, loadSubsystemDocs } from './subsystems-loader.js'

describe('loadSubsystemDocs', () => {
  let tmpRoot: string
  beforeEach(async () => {
    tmpRoot = await mkdtemp(join(tmpdir(), 'vg-loader-'))
  })
  afterEach(async () => {
    await rm(tmpRoot, { recursive: true, force: true })
  })

  it('returns empty when no .vibegraph/subsystems dir', async () => {
    const result = await loadSubsystemDocs(tmpRoot)
    expect(result.docs).toEqual([])
    expect(result.dirPath).toBeUndefined()
  })

  it('parses one valid doc', async () => {
    const dir = join(tmpRoot, '.vibegraph', 'subsystems')
    await mkdir(dir, { recursive: true })
    await writeFile(
      join(dir, 'payments.yml'),
      'id: payments\ntitle: Payments\nlayer: domain\nmatch: server/**\n',
    )
    const result = await loadSubsystemDocs(tmpRoot)
    expect(result.docs).toHaveLength(1)
    expect(result.docs[0]?.id).toBe('payments')
  })

  it('throws ID_MISMATCH when filename !== id', async () => {
    const dir = join(tmpRoot, '.vibegraph', 'subsystems')
    await mkdir(dir, { recursive: true })
    await writeFile(
      join(dir, 'payments.yml'),
      'id: oracle\ntitle: O\nlayer: domain\nmatch: src/**\n',
    )
    await expect(loadSubsystemDocs(tmpRoot)).rejects.toThrow(/ID_MISMATCH/)
  })

  it('throws DUPLICATE_ID', async () => {
    const dir = join(tmpRoot, '.vibegraph', 'subsystems')
    await mkdir(dir, { recursive: true })
    await writeFile(join(dir, 'a.yml'), 'id: x\ntitle: A\nlayer: domain\nmatch: a/**\n')
    await writeFile(join(dir, 'b.yml'), 'id: x\ntitle: B\nlayer: domain\nmatch: b/**\n')
    await expect(loadSubsystemDocs(tmpRoot)).rejects.toThrow(/DUPLICATE_ID/)
  })

  it('throws PARSE_ERROR on malformed yaml', async () => {
    const dir = join(tmpRoot, '.vibegraph', 'subsystems')
    await mkdir(dir, { recursive: true })
    await writeFile(join(dir, 'a.yml'), 'id: a\nlayer: [unclosed\n')
    await expect(loadSubsystemDocs(tmpRoot)).rejects.toThrow(/PARSE_ERROR/)
  })

  it('throws SCHEMA_INVALID with zod issues', async () => {
    const dir = join(tmpRoot, '.vibegraph', 'subsystems')
    await mkdir(dir, { recursive: true })
    await writeFile(join(dir, 'a.yml'), 'id: a\ntitle: A\nlayer: invalid\nmatch: src/**\n')
    await expect(loadSubsystemDocs(tmpRoot)).rejects.toThrow(/SCHEMA_INVALID/)
  })

  it('returns docs sorted by id', async () => {
    const dir = join(tmpRoot, '.vibegraph', 'subsystems')
    await mkdir(dir, { recursive: true })
    for (const name of ['oracle', 'payments', 'auth']) {
      await writeFile(
        join(dir, `${name}.yml`),
        `id: ${name}\ntitle: ${name}\nlayer: domain\nmatch: src/**\n`,
      )
    }
    const result = await loadSubsystemDocs(tmpRoot)
    expect(result.docs.map((d) => d.id)).toEqual(['auth', 'oracle', 'payments'])
  })

  it('skips non-yml files', async () => {
    const dir = join(tmpRoot, '.vibegraph', 'subsystems')
    await mkdir(dir, { recursive: true })
    await writeFile(join(dir, 'a.yml'), 'id: a\ntitle: A\nlayer: domain\nmatch: src/**\n')
    await writeFile(join(dir, 'README.md'), '# Random')
    await writeFile(join(dir, '.gitkeep'), '')
    const result = await loadSubsystemDocs(tmpRoot)
    expect(result.docs).toHaveLength(1)
  })
})
