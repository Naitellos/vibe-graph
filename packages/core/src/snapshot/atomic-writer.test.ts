import { mkdtempSync, readFileSync, readdirSync, realpathSync } from 'node:fs'
import { tmpdir } from 'node:os'
import { join } from 'node:path'
import { describe, expect, it } from 'vitest'
import { writeSnapshotAtomic } from './atomic-writer.js'

function mkTmp(): string {
  return realpathSync(mkdtempSync(join(tmpdir(), 'vg-atomic-')))
}

describe('writeSnapshotAtomic', () => {
  it('writes valid JSON to the target path', async () => {
    const dir = mkTmp()
    const target = join(dir, 'graph.json')
    const payload = { hello: 'world', n: 42 }
    await writeSnapshotAtomic(target, payload)
    const onDisk = JSON.parse(readFileSync(target, 'utf-8'))
    expect(onDisk).toEqual(payload)
  })

  it('does not leave a *.tmp-* file behind on success', async () => {
    const dir = mkTmp()
    const target = join(dir, 'graph.json')
    await writeSnapshotAtomic(target, { a: 1 })
    const stragglers = readdirSync(dir).filter((f) => f.startsWith('graph.json.tmp-'))
    expect(stragglers).toEqual([])
  })

  it('creates parent directories as needed', async () => {
    const dir = mkTmp()
    const target = join(dir, 'nested/sub/graph.json')
    await writeSnapshotAtomic(target, { ok: true })
    expect(JSON.parse(readFileSync(target, 'utf-8'))).toEqual({ ok: true })
  })
})
