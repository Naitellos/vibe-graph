import { mkdirSync, mkdtempSync, realpathSync, writeFileSync } from 'node:fs'
import { mkdir, writeFile } from 'node:fs/promises'
import { tmpdir } from 'node:os'
import { join } from 'node:path'
import { describe, expect, it } from 'vitest'
import { loadConfig } from './config-yml.js'

function mkTmp(): string {
  return realpathSync(mkdtempSync(join(tmpdir(), 'vg-config-')))
}

describe('loadConfig', () => {
  it('returns empty defaults when config absent', async () => {
    const root = mkTmp()
    const { config } = await loadConfig(root)
    expect(config.project.name).toBe(undefined)
    expect(config.subsystemDetection.mode).toBe('auto')
    expect(config.subsystems).toEqual([])
    expect(config.detectors).toEqual({})
  })

  it('parses a full config', async () => {
    const root = mkTmp()
    mkdirSync(join(root, '.vibegraph'))
    writeFileSync(
      join(root, '.vibegraph/config.yml'),
      `project:
  name: acme-app
subsystemDetection:
  mode: manual
subsystems:
  - id: oracle
    title: Oracle
    layer: domain
    match:
      - server/services/oracle*.ts
detectors:
  core/fan-out:
    threshold: 10
`,
    )
    const { config } = await loadConfig(root)
    expect(config.project.name).toBe('acme-app')
    expect(config.subsystemDetection.mode).toBe('manual')
    expect(config.subsystems).toHaveLength(1)
    expect(config.subsystems[0]?.id).toBe('oracle')
    expect(config.subsystems[0]?.match).toEqual(['server/services/oracle*.ts'])
    expect(config.detectors['core/fan-out']?.threshold).toBe(10)
  })

  it('throws on schema-invalid yaml', async () => {
    const root = mkTmp()
    mkdirSync(join(root, '.vibegraph'))
    writeFileSync(join(root, '.vibegraph/config.yml'), 'subsystemDetection:\n  mode: bogus\n')
    await expect(loadConfig(root)).rejects.toThrow(/subsystemDetection/)
  })

  it('loadConfig returns { config, subsystemDocs } shape', async () => {
    const root = mkTmp()
    const result = await loadConfig(root)
    expect(result).toHaveProperty('config')
    expect(result).toHaveProperty('subsystemDocs')
  })

  it('loads subsystem docs from .vibegraph/subsystems/', async () => {
    const root = mkTmp()
    const dir = join(root, '.vibegraph', 'subsystems')
    await mkdir(dir, { recursive: true })
    await writeFile(
      join(dir, 'auth.yml'),
      'id: auth\ntitle: Auth\nlayer: horizontal\nmatch: src/auth/**\n',
    )
    const result = await loadConfig(root)
    expect(result.subsystemDocs).toHaveLength(1)
  })

  describe('rules[] + DEFAULT_BUILTIN_RULES merge', () => {
    it('empty user rules → 4 built-in rules active', async () => {
      const root = mkTmp()
      const { config } = await loadConfig(root)
      expect(config.rules).toHaveLength(4)
      const ids = config.rules.map((r) => r.id)
      expect(ids).toContain('builtin:no-new-cycles')
      expect(ids).toContain('builtin:no-layer-violation')
      expect(ids).toContain('builtin:no-new-orphans')
      expect(ids).toContain('builtin:drift-must-not-worsen')
    })

    it('user adds a custom rule → 4 + 1 = 5 rules active', async () => {
      const root = mkTmp()
      mkdirSync(join(root, '.vibegraph'))
      writeFileSync(
        join(root, '.vibegraph/config.yml'),
        `rules:
  - kind: builtin
    id: custom:my-rule
    severity: high
    mode: warn
    check: no_cycles
    title: My Custom Rule
`,
      )
      const { config } = await loadConfig(root)
      expect(config.rules).toHaveLength(5)
      const ids = config.rules.map((r) => r.id)
      expect(ids).toContain('custom:my-rule')
      expect(ids).toContain('builtin:no-new-cycles')
    })

    it('user overrides builtin:no-new-cycles with mode: enforce → user version wins', async () => {
      const root = mkTmp()
      mkdirSync(join(root, '.vibegraph'))
      writeFileSync(
        join(root, '.vibegraph/config.yml'),
        `rules:
  - kind: builtin
    id: builtin:no-new-cycles
    severity: high
    mode: enforce
    check: no_cycles
    title: No new architectural cycles
`,
      )
      const { config } = await loadConfig(root)
      expect(config.rules).toHaveLength(4)
      const noNewCycles = config.rules.find((r) => r.id === 'builtin:no-new-cycles')
      expect(noNewCycles).toBeDefined()
      expect(noNewCycles?.mode).toBe('enforce')
    })

    it('user provides own definition for builtin:no-layer-violation → user wins', async () => {
      const root = mkTmp()
      mkdirSync(join(root, '.vibegraph'))
      writeFileSync(
        join(root, '.vibegraph/config.yml'),
        `rules:
  - kind: edge-pattern
    id: builtin:no-layer-violation
    title: Domain must not depend on UI layer
    severity: low
    mode: advisory
    from:
      layer: domain
    to:
      layer: horizontal
    relation: depends_on
    forbidden: true
`,
      )
      const { config } = await loadConfig(root)
      expect(config.rules).toHaveLength(4)
      const layerViolation = config.rules.find((r) => r.id === 'builtin:no-layer-violation')
      expect(layerViolation).toBeDefined()
      expect(layerViolation?.severity).toBe('low')
    })
  })
})
