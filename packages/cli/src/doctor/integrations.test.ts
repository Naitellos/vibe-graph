import { mkdtempSync, realpathSync, writeFileSync } from 'node:fs'
import { tmpdir } from 'node:os'
import { join } from 'node:path'
import { describe, expect, it } from 'vitest'
import { INTEGRATION_CHECKS, mcpJsonCheck } from './integrations.js'

function mkTmp(): string {
  return realpathSync(mkdtempSync(join(tmpdir(), 'vg-integ-')))
}

describe('mcpJsonCheck', () => {
  it('returns info when .mcp.json absent', async () => {
    const projectRoot = mkTmp()
    const r = await mcpJsonCheck.run({ projectRoot })
    expect(r.status).toBe('info')
  })

  it('warns on invalid JSON', async () => {
    const projectRoot = mkTmp()
    writeFileSync(join(projectRoot, '.mcp.json'), 'not json{{')
    const r = await mcpJsonCheck.run({ projectRoot })
    expect(r.status).toBe('warn')
    expect(r.message).toContain('parse')
  })

  it('warns on empty mcpServers', async () => {
    const projectRoot = mkTmp()
    writeFileSync(join(projectRoot, '.mcp.json'), JSON.stringify({ mcpServers: {} }))
    const r = await mcpJsonCheck.run({ projectRoot })
    expect(r.status).toBe('warn')
  })

  it('returns ok when commands resolve on PATH', async () => {
    const projectRoot = mkTmp()
    writeFileSync(
      join(projectRoot, '.mcp.json'),
      JSON.stringify({ mcpServers: { vibegraph: { command: 'node', args: ['x'] } } }),
    )
    const r = await mcpJsonCheck.run({ projectRoot })
    expect(r.status).toBe('ok')
  })

  it('warns when a command is missing on PATH', async () => {
    const projectRoot = mkTmp()
    writeFileSync(
      join(projectRoot, '.mcp.json'),
      JSON.stringify({
        mcpServers: { broken: { command: '__nonexistent_binary_xyz__', args: [] } },
      }),
    )
    const r = await mcpJsonCheck.run({ projectRoot })
    expect(r.status).toBe('warn')
    expect(r.message).toContain('PATH')
  })
})

describe('INTEGRATION_CHECKS registry', () => {
  it('exports the mcp-json check', () => {
    expect(INTEGRATION_CHECKS).toHaveLength(1)
    expect(INTEGRATION_CHECKS[0]?.id).toBe('integrations/mcp-json')
  })
})
