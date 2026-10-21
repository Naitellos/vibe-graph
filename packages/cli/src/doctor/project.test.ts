import { mkdirSync, mkdtempSync, realpathSync, writeFileSync } from 'node:fs'
import { tmpdir } from 'node:os'
import { join } from 'node:path'
import { describe, expect, it } from 'vitest'
import {
  PROJECT_CHECKS,
  cacheCheck,
  configYmlCheck,
  ignoreFileCheck,
  subsystemsCheck,
} from './project.js'

function mkTmp(): string {
  return realpathSync(mkdtempSync(join(tmpdir(), 'vg-doctor-')))
}

describe('configYmlCheck', () => {
  it('warns when .vibegraph/config.yml absent', async () => {
    const projectRoot = mkTmp()
    const r = await configYmlCheck.run({ projectRoot })
    expect(r.status).toBe('warn')
    expect(r.message).toContain('No .vibegraph/config.yml')
  })

  it('returns ok for a valid yaml', async () => {
    const projectRoot = mkTmp()
    mkdirSync(join(projectRoot, '.vibegraph'))
    writeFileSync(join(projectRoot, '.vibegraph/config.yml'), 'project:\n  name: x\n')
    const r = await configYmlCheck.run({ projectRoot })
    expect(r.status).toBe('ok')
  })

  it('errors on schema-invalid yaml', async () => {
    const projectRoot = mkTmp()
    mkdirSync(join(projectRoot, '.vibegraph'))
    writeFileSync(
      join(projectRoot, '.vibegraph/config.yml'),
      'subsystemDetection:\n  mode: bogus\n',
    )
    const r = await configYmlCheck.run({ projectRoot })
    expect(r.status).toBe('error')
  })
})

describe('ignoreFileCheck', () => {
  it('warns when .vibegraphignore absent', async () => {
    const projectRoot = mkTmp()
    const r = await ignoreFileCheck.run({ projectRoot })
    expect(r.status).toBe('warn')
    expect(r.message).toContain('No .vibegraphignore')
  })

  it('warns when .vibegraphignore lacks .env', async () => {
    const projectRoot = mkTmp()
    writeFileSync(join(projectRoot, '.vibegraphignore'), 'node_modules\n')
    const r = await ignoreFileCheck.run({ projectRoot })
    expect(r.status).toBe('warn')
    expect(r.message).toContain('.env')
  })

  it('returns ok when .vibegraphignore includes .env', async () => {
    const projectRoot = mkTmp()
    writeFileSync(join(projectRoot, '.vibegraphignore'), '.env\n.env.*\nnode_modules\n')
    const r = await ignoreFileCheck.run({ projectRoot })
    expect(r.status).toBe('ok')
  })
})

describe('cacheCheck', () => {
  it('returns info when graph.json absent', async () => {
    const projectRoot = mkTmp()
    const r = await cacheCheck.run({ projectRoot })
    expect(r.status).toBe('info')
  })

  it('returns ok for a valid graph.json with current schema version', async () => {
    const projectRoot = mkTmp()
    mkdirSync(join(projectRoot, '.vibegraph/cache'), { recursive: true })
    const snap = {
      meta: {
        schemaVersion: '0.1.0',
        scanId: '11111111-1111-4111-8111-111111111111',
        builtAt: '2026-05-25T00:00:00.000Z',
        projectRoot,
        projectName: 'demo',
        vibegraphVersion: '0.0.0',
        scanDurationMs: 1,
        fileCounts: { scanned: 0, indexed: 0, skipped: 0 },
      },
      nodes: [],
      edges: [],
      evidence: [],
      findings: [],
    }
    writeFileSync(join(projectRoot, '.vibegraph/cache/graph.json'), JSON.stringify(snap))
    const r = await cacheCheck.run({ projectRoot })
    expect(r.status).toBe('ok')
  })

  it('errors on corrupt graph.json', async () => {
    const projectRoot = mkTmp()
    mkdirSync(join(projectRoot, '.vibegraph/cache'), { recursive: true })
    writeFileSync(join(projectRoot, '.vibegraph/cache/graph.json'), 'not json')
    const r = await cacheCheck.run({ projectRoot })
    expect(r.status).toBe('error')
  })
})

describe('subsystemsCheck', () => {
  it('returns ok with doc count when .vibegraph/subsystems/*.yml exists', async () => {
    const projectRoot = mkTmp()
    mkdirSync(join(projectRoot, '.vibegraph', 'subsystems'), { recursive: true })
    writeFileSync(
      join(projectRoot, '.vibegraph/subsystems/payments.yml'),
      'id: payments\ntitle: Payments\nlayer: domain\nmatch: "src/payments/**"\ndescription: Payment processing\n',
    )
    writeFileSync(
      join(projectRoot, '.vibegraph/subsystems/auth.yml'),
      'id: auth\ntitle: Auth\nlayer: domain\nmatch: "src/auth/**"\ndescription: Authentication\n',
    )
    const r = await subsystemsCheck.run({ projectRoot })
    expect(r.status).toBe('ok')
    expect(r.message).toContain('2 docs')
  })

  it('returns info when .vibegraph/subsystems dir absent', async () => {
    const projectRoot = mkTmp()
    const r = await subsystemsCheck.run({ projectRoot })
    expect(r.status).toBe('info')
    expect(r.message).toContain('no subsystems')
  })

  it('errors on PARSE_ERROR in subsystems', async () => {
    const projectRoot = mkTmp()
    mkdirSync(join(projectRoot, '.vibegraph', 'subsystems'), { recursive: true })
    writeFileSync(join(projectRoot, '.vibegraph/subsystems/bad.yml'), 'invalid: [yaml')
    const r = await subsystemsCheck.run({ projectRoot })
    expect(r.status).toBe('error')
    expect(r.message).toContain('PARSE_ERROR')
  })

  it('errors on SCHEMA_INVALID in subsystems', async () => {
    const projectRoot = mkTmp()
    mkdirSync(join(projectRoot, '.vibegraph', 'subsystems'), { recursive: true })
    writeFileSync(
      join(projectRoot, '.vibegraph/subsystems/bad.yml'),
      'id: missing-title\nmatch: "src/**"\nlayer: infra\n',
    )
    const r = await subsystemsCheck.run({ projectRoot })
    expect(r.status).toBe('error')
    expect(r.message).toContain('SCHEMA_INVALID')
  })

  it('errors on ID_MISMATCH in subsystems', async () => {
    const projectRoot = mkTmp()
    mkdirSync(join(projectRoot, '.vibegraph', 'subsystems'), { recursive: true })
    writeFileSync(
      join(projectRoot, '.vibegraph/subsystems/payments.yml'),
      'id: auth\ntitle: Auth\nlayer: domain\nmatch: "src/auth/**"\ndescription: Auth service\n',
    )
    const r = await subsystemsCheck.run({ projectRoot })
    expect(r.status).toBe('error')
    expect(r.message).toContain('ID_MISMATCH')
  })
})

describe('PROJECT_CHECKS registry', () => {
  it('exports 4 checks: config, ignore, cache, subsystems', () => {
    expect(PROJECT_CHECKS).toHaveLength(4)
  })
})
