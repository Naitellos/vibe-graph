import { mkdirSync, mkdtempSync, readFileSync, realpathSync, writeFileSync } from 'node:fs'
import { tmpdir } from 'node:os'
import { dirname, join } from 'node:path'
import { Writable } from 'node:stream'
import { describe, expect, it } from 'vitest'
import { createCliLogger } from '../logger.js'
import { runOneShotScan } from './scan.js'

function mkTmp(): string {
  return realpathSync(mkdtempSync(join(tmpdir(), 'vg-cli-scan-')))
}

function touch(root: string, relPath: string, body = ''): void {
  const abs = join(root, relPath)
  mkdirSync(dirname(abs), { recursive: true })
  writeFileSync(abs, body)
}

class MemoryStream extends Writable {
  chunks: string[] = []
  _write(chunk: Buffer | string, _encoding: string, callback: () => void): void {
    this.chunks.push(chunk.toString('utf-8'))
    callback()
  }
  get text(): string {
    return this.chunks.join('')
  }
}

const flush = (): Promise<void> => new Promise((resolve) => setImmediate(resolve))

describe('runOneShotScan', () => {
  it('produces a summary with counts + writes graph.json', async () => {
    const root = mkTmp()
    writeFileSync(join(root, 'package.json'), JSON.stringify({ name: 'cli-scan-fixture' }))
    writeFileSync(
      join(root, 'tsconfig.json'),
      JSON.stringify({
        compilerOptions: {
          strict: true,
          target: 'ES2022',
          module: 'NodeNext',
          moduleResolution: 'NodeNext',
        },
        include: ['src/**/*'],
      }),
    )
    touch(root, 'src/a.ts', 'export const a = 1\n')
    touch(root, 'src/b.ts', "import { a } from './a.js'\nexport const b = a + 1\n")

    const log = createCliLogger({ json: true, quiet: true }) // silent JSON for tests
    const summary = await runOneShotScan({ root, log })

    expect(summary.scanId).toMatch(
      /^[0-9a-f]{8}-[0-9a-f]{4}-4[0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/,
    )
    expect(summary.durationMs).toBeGreaterThan(0)
    expect(summary.counts.nodes).toBeGreaterThan(0)
    expect(summary.counts.edges).toBeGreaterThan(0)
    expect(summary.graphPath).toMatch(/\.vibegraph\/cache\/graph\.json$/)

    // graph.json exists on disk and parses
    const raw = readFileSync(summary.graphPath, 'utf-8')
    const parsed = JSON.parse(raw) as { meta: { scanId: string }; nodes: unknown[] }
    expect(parsed.meta.scanId).toBe(summary.scanId)
    expect(parsed.nodes.length).toBe(summary.counts.nodes)
  }, 30_000)

  it('surfaces the config/docs subsystem-shadow warning to the user on a normal scan', async () => {
    const root = mkTmp()
    writeFileSync(join(root, 'package.json'), JSON.stringify({ name: 'shadow-fixture' }))
    touch(root, 'src/core/a.ts', 'export const a = 1\n')
    // Inline subsystems in config.yml...
    touch(
      root,
      '.vibegraph/config.yml',
      [
        'project:',
        '  name: shadow-fixture',
        'subsystems:',
        '  - id: core',
        '    title: Core',
        '    layer: domain',
        '    match: ["src/core/**"]',
        '',
      ].join('\n'),
    )
    // ...are shadowed by a subsystem doc, so the inline entry is silently dropped.
    touch(
      root,
      '.vibegraph/subsystems/core.yml',
      'id: core\ntitle: Core\nlayer: domain\nmatch: src/core/**\n',
    )

    const dest = new MemoryStream()
    const log = createCliLogger({ json: true, quiet: false, destination: dest })
    await runOneShotScan({ root, log })
    await flush()

    expect(dest.text).toContain('shadowed by')
  }, 30_000)

  it('writes to <projectRoot>/.vibegraph/cache/graph.json', async () => {
    const root = mkTmp()
    writeFileSync(join(root, 'package.json'), JSON.stringify({ name: 'path-test' }))
    touch(root, 'src/x.ts', 'export const x = 1\n')

    const log = createCliLogger({ json: true, quiet: true })
    const summary = await runOneShotScan({ root, log })

    expect(summary.graphPath).toBe(join(root, '.vibegraph/cache/graph.json'))
  }, 30_000)
})
