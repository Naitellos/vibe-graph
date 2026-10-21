import { describe, expect, it } from 'vitest'
import { parseBinArgs } from './bin-config.js'

describe('parseBinArgs', () => {
  it('defaults projectRoot to cwd when --project-root not provided', () => {
    const cfg = parseBinArgs({ argv: [], env: {}, cwd: '/home/u/proj' })
    expect(cfg.projectRoot).toBe('/home/u/proj')
    expect(cfg.snapshotPath).toBe('/home/u/proj/.vibegraph/cache/graph.json')
  })

  it('parses --project-root <path>', () => {
    const cfg = parseBinArgs({ argv: ['--project-root', '/other'], env: {}, cwd: '/cwd' })
    expect(cfg.projectRoot).toBe('/other')
    expect(cfg.snapshotPath).toBe('/other/.vibegraph/cache/graph.json')
  })

  it('parses --project-root=<path>', () => {
    const cfg = parseBinArgs({ argv: ['--project-root=/other'], env: {}, cwd: '/cwd' })
    expect(cfg.projectRoot).toBe('/other')
  })

  it('defaults autoScanOnMissing to true when env unset', () => {
    const cfg = parseBinArgs({ argv: [], env: {}, cwd: '/cwd' })
    expect(cfg.autoScanOnMissing).toBe(true)
  })

  it.each([
    ['false', false],
    ['0', false],
    ['no', false],
    ['FALSE', false],
    ['true', true],
    ['1', true],
    ['yes', true],
    ['', true], // empty string → not in disable list → enabled
  ])('VIBEGRAPH_MCP_AUTO_SCAN=%s → autoScan=%s', (val, expected) => {
    const cfg = parseBinArgs({ argv: [], env: { VIBEGRAPH_MCP_AUTO_SCAN: val }, cwd: '/c' })
    expect(cfg.autoScanOnMissing).toBe(expected)
  })

  it('--project-root appears after other args', () => {
    const cfg = parseBinArgs({
      argv: ['--unrelated', 'value', '--project-root', '/p'],
      env: {},
      cwd: '/c',
    })
    expect(cfg.projectRoot).toBe('/p')
  })

  it('last --project-root wins (LIFO not enforced — last write wins by loop order)', () => {
    const cfg = parseBinArgs({
      argv: ['--project-root', '/first', '--project-root', '/second'],
      env: {},
      cwd: '/c',
    })
    expect(cfg.projectRoot).toBe('/second')
  })
})
