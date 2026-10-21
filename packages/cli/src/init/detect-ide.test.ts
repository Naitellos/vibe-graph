import { mkdirSync, mkdtempSync, realpathSync } from 'node:fs'
import { tmpdir } from 'node:os'
import { join } from 'node:path'
import { describe, expect, it } from 'vitest'
import { detectIde } from './detect-ide.js'

function mkTmp(): string {
  return realpathSync(mkdtempSync(join(tmpdir(), 'vg-ide-')))
}

describe('detectIde', () => {
  it('returns empty when no IDE markers present', () => {
    const projectRoot = mkTmp()
    const fakeHome = mkTmp()
    const result = detectIde({ projectRoot, homeDir: fakeHome })
    expect(result.ides).toEqual([])
    expect(result.evidence).toEqual([])
  })

  it('detects claude-code via project .claude/', () => {
    const projectRoot = mkTmp()
    const fakeHome = mkTmp()
    mkdirSync(join(projectRoot, '.claude'))
    const result = detectIde({ projectRoot, homeDir: fakeHome })
    expect(result.ides).toEqual(['claude-code'])
    expect(result.evidence[0]?.source).toBe(join(projectRoot, '.claude'))
  })

  it('detects claude-code via home ~/.claude/', () => {
    const projectRoot = mkTmp()
    const fakeHome = mkTmp()
    mkdirSync(join(fakeHome, '.claude'))
    const result = detectIde({ projectRoot, homeDir: fakeHome })
    expect(result.ides).toEqual(['claude-code'])
    expect(result.evidence[0]?.source).toBe(join(fakeHome, '.claude'))
  })

  it('detects cursor via project .cursor/', () => {
    const projectRoot = mkTmp()
    const fakeHome = mkTmp()
    mkdirSync(join(projectRoot, '.cursor'))
    const result = detectIde({ projectRoot, homeDir: fakeHome })
    expect(result.ides).toContain('cursor')
  })

  it('detects both IDEs when present', () => {
    const projectRoot = mkTmp()
    const fakeHome = mkTmp()
    mkdirSync(join(projectRoot, '.claude'))
    mkdirSync(join(projectRoot, '.cursor'))
    const result = detectIde({ projectRoot, homeDir: fakeHome })
    expect(result.ides.sort()).toEqual(['claude-code', 'cursor'])
  })

  it('dedups when claude-code found in both project + home', () => {
    const projectRoot = mkTmp()
    const fakeHome = mkTmp()
    mkdirSync(join(projectRoot, '.claude'))
    mkdirSync(join(fakeHome, '.claude'))
    const result = detectIde({ projectRoot, homeDir: fakeHome })
    expect(result.ides).toEqual(['claude-code'])
    // Evidence should record only the FIRST (project-level wins)
    expect(result.evidence).toHaveLength(1)
    expect(result.evidence[0]?.source).toBe(join(projectRoot, '.claude'))
  })
})
