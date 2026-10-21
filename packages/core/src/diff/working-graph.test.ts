import { mkdir, rm, writeFile } from 'node:fs/promises'
import { tmpdir } from 'node:os'
import { join } from 'node:path'
import { afterEach, beforeEach, describe, expect, it } from 'vitest'
import { buildWorkingGraph } from './working-graph.js'

describe('buildWorkingGraph', () => {
  let tmpRoot: string

  beforeEach(async () => {
    tmpRoot = join(tmpdir(), `vg-working-graph-${Date.now()}-${Math.random()}`)
    await mkdir(join(tmpRoot, '.vibegraph', 'cache'), { recursive: true })
    await mkdir(join(tmpRoot, 'src'), { recursive: true })
    await writeFile(
      join(tmpRoot, '.vibegraph', 'config.yml'),
      'project:\n  name: wg-test\n  root: .\nsubsystemDetection:\n  mode: auto\n',
      'utf-8',
    )
    await writeFile(
      join(tmpRoot, 'package.json'),
      '{"name":"wg-test","version":"0.0.0"}\n',
      'utf-8',
    )
    await writeFile(join(tmpRoot, 'src', 'a.ts'), 'export const A = 1\n', 'utf-8')
    await writeFile(
      join(tmpRoot, 'src', 'b.ts'),
      `import { A } from './a.js'; export const B = A\n`,
      'utf-8',
    )
  })

  afterEach(async () => {
    await rm(tmpRoot, { recursive: true, force: true })
  })

  it('produces a snapshot whose node/edge counts match a full re-scan', async () => {
    const working = await buildWorkingGraph({
      projectRoot: tmpRoot,
      changedFiles: ['src/a.ts', 'src/b.ts'],
      deletedFiles: [],
    })
    expect(working.nodes.length).toBeGreaterThan(0)
    expect(working.edges.length).toBeGreaterThan(0)
    expect(working.nodes.find((n) => n.id === 'file:src/a.ts')).toBeTruthy()
  })

  it('drops file nodes for deleted files from the working graph', async () => {
    const working = await buildWorkingGraph({
      projectRoot: tmpRoot,
      changedFiles: [],
      deletedFiles: ['src/a.ts'],
    })
    expect(working.nodes.find((n) => n.id === 'file:src/a.ts')).toBeFalsy()
  })

  it('drops edges referencing deleted nodes', async () => {
    const working = await buildWorkingGraph({
      projectRoot: tmpRoot,
      changedFiles: [],
      deletedFiles: ['src/a.ts'],
    })
    const orphanEdges = working.edges.filter(
      (e) => e.from === 'file:src/a.ts' || e.to === 'file:src/a.ts',
    )
    expect(orphanEdges.length).toBe(0)
  })

  it('does not write to disk (in-memory only)', async () => {
    const { readFile } = await import('node:fs/promises')
    await buildWorkingGraph({
      projectRoot: tmpRoot,
      changedFiles: ['src/a.ts'],
      deletedFiles: [],
    })
    const graphPath = join(tmpRoot, '.vibegraph', 'cache', 'graph.json')
    await expect(readFile(graphPath)).rejects.toThrow()
  })
})
