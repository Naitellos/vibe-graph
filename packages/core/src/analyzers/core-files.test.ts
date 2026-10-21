import { mkdirSync, mkdtempSync, realpathSync, writeFileSync } from 'node:fs'
import { tmpdir } from 'node:os'
import { dirname, join } from 'node:path'
import { pino } from 'pino'
import { describe, expect, it } from 'vitest'
import { DEFAULT_CONFIG } from '../config/config-yml.js'
import { coreFilesAnalyzer } from './core-files.js'
import { createIgnoreMatcher } from './ignore-matcher.js'
import type { ProgramManager } from './program-manager.js'

function mkTmp(): string {
  return realpathSync(mkdtempSync(join(tmpdir(), 'vg-core-files-')))
}

function touch(root: string, relPath: string, body = '') {
  const abs = join(root, relPath)
  mkdirSync(dirname(abs), { recursive: true })
  writeFileSync(abs, body)
}

describe('coreFilesAnalyzer', () => {
  it('emits one file Node per discovered file with stable ids and correct titles', async () => {
    const root = mkTmp()
    touch(root, 'src/alpha.ts')
    touch(root, 'src/beta.ts')
    touch(root, 'lib/gamma.js')

    const files = [
      join(root, 'src/alpha.ts'),
      join(root, 'src/beta.ts'),
      join(root, 'lib/gamma.js'),
    ]

    const programs: ProgramManager = {
      getProgramForFile: () => ({}) as never,
      getAllPrograms: () => [],
    }

    const ignore = createIgnoreMatcher({ patterns: [], includeDefaults: true })
    const log = pino({ level: 'silent' })

    const result = await coreFilesAnalyzer.run({
      projectRoot: root,
      files,
      programs,
      ignore,
      log,
      config: DEFAULT_CONFIG,
    })

    expect(result.nodes).toHaveLength(3)
    expect(result.edges).toEqual([])
    expect(result.evidence).toEqual([])

    for (const node of result.nodes) {
      expect(node.kind).toBe('file')
    }

    const alphaNode = result.nodes.find((n) => n.id === 'file:src/alpha.ts')
    expect(alphaNode).toBeDefined()
    expect(alphaNode?.title).toBe('alpha.ts')

    const betaNode = result.nodes.find((n) => n.id === 'file:src/beta.ts')
    expect(betaNode).toBeDefined()
    expect(betaNode?.title).toBe('beta.ts')

    const gammaNode = result.nodes.find((n) => n.id === 'file:lib/gamma.js')
    expect(gammaNode).toBeDefined()
    expect(gammaNode?.title).toBe('gamma.js')
  })
})
