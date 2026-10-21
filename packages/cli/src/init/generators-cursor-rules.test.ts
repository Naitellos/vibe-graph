import { mkdir, readFile, rm } from 'node:fs/promises'
import { tmpdir } from 'node:os'
import { join } from 'node:path'
import { afterEach, beforeEach, describe, expect, it } from 'vitest'
import { generateCursorRules } from './generators-cursor-rules.js'

describe('generateCursorRules', () => {
  let tmpRoot: string

  beforeEach(async () => {
    tmpRoot = join(tmpdir(), `vg-cursor-rules-${Date.now()}-${Math.random()}`)
    await mkdir(tmpRoot, { recursive: true })
  })

  afterEach(async () => {
    await rm(tmpRoot, { recursive: true, force: true })
  })

  it('writes .cursor/rules/vibe-graph.mdc with required sections', async () => {
    const result = await generateCursorRules({ projectRoot: tmpRoot })
    expect(result.written).toBe(true)
    const content = await readFile(result.path, 'utf-8')
    expect(content).toContain('prepare_task')
    expect(content).toContain('validate_diff')
    expect(content).toContain('description: Architecture preflight via vibe-graph')
    expect(content).toMatch(/^---[\s\S]+---/)
  })

  it('skips when file exists and overwrite=false', async () => {
    await generateCursorRules({ projectRoot: tmpRoot })
    const second = await generateCursorRules({ projectRoot: tmpRoot })
    expect(second.written).toBe(false)
    expect(second.skipped).toBe('exists')
  })

  it('overwrites when overwrite=true', async () => {
    await generateCursorRules({ projectRoot: tmpRoot })
    const second = await generateCursorRules({ projectRoot: tmpRoot, overwrite: true })
    expect(second.written).toBe(true)
    expect(second.skipped).toBeUndefined()
  })
})
