import { mkdirSync, mkdtempSync, realpathSync, writeFileSync } from 'node:fs'
import { tmpdir } from 'node:os'
import { join } from 'node:path'
import { describe, expect, it } from 'vitest'
import { resolveProjectRoot } from './project-root.js'

function mkTmp(): string {
  return realpathSync(mkdtempSync(join(tmpdir(), 'vibe-graph-test-')))
}

describe('resolveProjectRoot', () => {
  it('returns explicit --root absolute path if given', async () => {
    const tmp = mkTmp()
    const got = await resolveProjectRoot({ explicit: tmp, cwd: '/elsewhere' })
    expect(got).toBe(realpathSync(tmp))
  })

  it('finds .vibegraph/config.yml upward', async () => {
    const root = mkTmp()
    mkdirSync(join(root, '.vibegraph'))
    writeFileSync(join(root, '.vibegraph/config.yml'), 'project:\n  name: x\n')
    const sub = join(root, 'a/b/c')
    mkdirSync(sub, { recursive: true })
    const got = await resolveProjectRoot({ explicit: undefined, cwd: sub })
    expect(got).toBe(realpathSync(root))
  })

  it('falls back to package.json upward if no .vibegraph and no git', async () => {
    const root = mkTmp()
    writeFileSync(join(root, 'package.json'), '{}')
    const sub = join(root, 'src/foo')
    mkdirSync(sub, { recursive: true })
    const got = await resolveProjectRoot({ explicit: undefined, cwd: sub })
    expect(got).toBe(realpathSync(root))
  })

  it('falls back to cwd if nothing found', async () => {
    const tmp = mkTmp()
    const got = await resolveProjectRoot({ explicit: undefined, cwd: tmp })
    expect(got).toBe(realpathSync(tmp))
  })
})
