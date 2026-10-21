import { existsSync, mkdtempSync, readFileSync, realpathSync, writeFileSync } from 'node:fs'
import { tmpdir } from 'node:os'
import { join } from 'node:path'
import { describe, expect, it } from 'vitest'
import {
  MANAGED_GITIGNORE_LINES,
  appendGitignore,
  generateConfigYml,
  generateIgnoreFile,
  generateMcpConfig,
} from './generators.js'

function mkTmp(): string {
  return realpathSync(mkdtempSync(join(tmpdir(), 'vg-gen-')))
}

describe('generateConfigYml', () => {
  it('writes .vibegraph/config.yml with project.name', async () => {
    const projectRoot = mkTmp()
    const result = await generateConfigYml({ projectRoot, projectName: 'my-app' })
    expect(result.written).toBe(true)
    expect(result.path).toBe(join(projectRoot, '.vibegraph/config.yml'))
    const content = readFileSync(result.path, 'utf-8')
    expect(content).toContain('name: my-app')
    expect(content).toContain('subsystemDetection:')
    expect(content).toContain('mode: auto')
  })

  it('skips when file exists (no overwrite)', async () => {
    const projectRoot = mkTmp()
    await generateConfigYml({ projectRoot, projectName: 'first' })
    const result = await generateConfigYml({ projectRoot, projectName: 'second' })
    expect(result.written).toBe(false)
    expect(result.skipped).toBe('exists')
    // Original content preserved
    const content = readFileSync(result.path, 'utf-8')
    expect(content).toContain('name: first')
    expect(content).not.toContain('name: second')
  })

  it('overwrites when overwrite=true', async () => {
    const projectRoot = mkTmp()
    await generateConfigYml({ projectRoot, projectName: 'first' })
    const result = await generateConfigYml({ projectRoot, projectName: 'second', overwrite: true })
    expect(result.written).toBe(true)
    const content = readFileSync(result.path, 'utf-8')
    expect(content).toContain('name: second')
  })

  it('creates .vibegraph parent directory', async () => {
    const projectRoot = mkTmp()
    const result = await generateConfigYml({ projectRoot, projectName: 'x' })
    expect(existsSync(join(projectRoot, '.vibegraph'))).toBe(true)
    expect(result.written).toBe(true)
  })
})

describe('generateIgnoreFile', () => {
  it('writes .vibegraphignore with defaults', async () => {
    const projectRoot = mkTmp()
    const result = await generateIgnoreFile({ projectRoot })
    expect(result.written).toBe(true)
    const content = readFileSync(result.path, 'utf-8')
    expect(content).toContain('node_modules')
    expect(content).toContain('.env')
    expect(content).toContain('.env.*')
  })

  it('skips when exists (no overwrite)', async () => {
    const projectRoot = mkTmp()
    writeFileSync(join(projectRoot, '.vibegraphignore'), '# custom\n')
    const result = await generateIgnoreFile({ projectRoot })
    expect(result.written).toBe(false)
    expect(result.skipped).toBe('exists')
    const content = readFileSync(result.path, 'utf-8')
    expect(content).toBe('# custom\n')
  })

  it('overwrites when overwrite=true', async () => {
    const projectRoot = mkTmp()
    writeFileSync(join(projectRoot, '.vibegraphignore'), '# old\n')
    const result = await generateIgnoreFile({ projectRoot, overwrite: true })
    expect(result.written).toBe(true)
    const content = readFileSync(result.path, 'utf-8')
    expect(content).toContain('node_modules')
  })
})

describe('appendGitignore', () => {
  it('creates .gitignore when absent', async () => {
    const projectRoot = mkTmp()
    const result = await appendGitignore({ projectRoot })
    expect(result.created).toBe(true)
    expect(result.appended).toEqual([...MANAGED_GITIGNORE_LINES])
    const content = readFileSync(result.path, 'utf-8')
    expect(content).toContain('.vibegraph/cache/')
    expect(content).toContain('.vibegraph/logs/')
    expect(content).toContain('.superpowers/')
    expect(content).toContain('# >>> vibe-graph >>>')
    expect(content).toContain('# <<< vibe-graph <<<')
  })

  it('appends to existing .gitignore', async () => {
    const projectRoot = mkTmp()
    writeFileSync(join(projectRoot, '.gitignore'), 'node_modules\ndist\n')
    const result = await appendGitignore({ projectRoot })
    expect(result.created).toBe(false)
    expect(result.appended.length).toBe(3)
    const content = readFileSync(result.path, 'utf-8')
    expect(content).toContain('node_modules')
    expect(content).toContain('dist')
    expect(content).toContain('.vibegraph/cache/')
  })

  it('is idempotent — calling twice does not duplicate', async () => {
    const projectRoot = mkTmp()
    writeFileSync(join(projectRoot, '.gitignore'), 'node_modules\n')
    await appendGitignore({ projectRoot })
    const result = await appendGitignore({ projectRoot })
    expect(result.appended).toEqual([])
    const content = readFileSync(result.path, 'utf-8')
    // Only one block of managed lines
    const blockMatches = content.match(/# >>> vibe-graph >>>/g) ?? []
    expect(blockMatches.length).toBe(1)
    // .vibegraph/cache/ appears exactly once
    const cacheMatches = content.match(/\.vibegraph\/cache\//g) ?? []
    expect(cacheMatches.length).toBe(1)
  })

  it('replaces existing marker block if managed lines change', async () => {
    const projectRoot = mkTmp()
    writeFileSync(
      join(projectRoot, '.gitignore'),
      'node_modules\n\n# >>> vibe-graph >>>\n.old-managed-entry/\n# <<< vibe-graph <<<\n',
    )
    const result = await appendGitignore({ projectRoot })
    expect(result.appended.length).toBe(3)
    const content = readFileSync(result.path, 'utf-8')
    expect(content).not.toContain('.old-managed-entry')
    expect(content).toContain('.vibegraph/cache/')
    expect(content).toContain('.superpowers/')
  })

  it('reports empty appended[] when all managed lines already present (without marker)', async () => {
    const projectRoot = mkTmp()
    writeFileSync(
      join(projectRoot, '.gitignore'),
      '.vibegraph/cache/\n.vibegraph/logs/\n.superpowers/\n',
    )
    const result = await appendGitignore({ projectRoot })
    expect(result.appended).toEqual([])
    // File unchanged
    const content = readFileSync(result.path, 'utf-8')
    expect(content).toBe('.vibegraph/cache/\n.vibegraph/logs/\n.superpowers/\n')
  })
})

describe('generateMcpConfig', () => {
  it('writes .mcp.json for claude-code target', async () => {
    const projectRoot = mkTmp()
    const result = await generateMcpConfig({ projectRoot, target: 'claude-code' })
    expect(result.written).toBe(true)
    expect(result.path).toBe(join(projectRoot, '.mcp.json'))
    const parsed = JSON.parse(readFileSync(result.path, 'utf-8')) as {
      mcpServers: { vibegraph: { command: string; args: string[] } }
    }
    expect(parsed.mcpServers.vibegraph.command).toBe('npx')
    expect(parsed.mcpServers.vibegraph.args).toEqual(['-y', '@codearch/cli', 'mcp'])
  })

  it('writes .cursor/mcp.json for cursor target (creates parent dir)', async () => {
    const projectRoot = mkTmp()
    const result = await generateMcpConfig({ projectRoot, target: 'cursor' })
    expect(result.written).toBe(true)
    expect(result.path).toBe(join(projectRoot, '.cursor', 'mcp.json'))
    expect(existsSync(join(projectRoot, '.cursor'))).toBe(true)
    const parsed = JSON.parse(readFileSync(result.path, 'utf-8')) as {
      mcpServers: { vibegraph: { command: string; args: string[] } }
    }
    expect(parsed.mcpServers.vibegraph.command).toBe('npx')
  })

  it('skips with already-configured when vibegraph entry exists', async () => {
    const projectRoot = mkTmp()
    writeFileSync(
      join(projectRoot, '.mcp.json'),
      JSON.stringify({ mcpServers: { vibegraph: { command: 'old', args: ['x'] } } }),
    )
    const result = await generateMcpConfig({ projectRoot, target: 'claude-code' })
    expect(result.written).toBe(false)
    expect(result.skipped).toBe('already-configured')
  })

  it('overwrites vibegraph entry when overwrite=true', async () => {
    const projectRoot = mkTmp()
    writeFileSync(
      join(projectRoot, '.mcp.json'),
      JSON.stringify({ mcpServers: { vibegraph: { command: 'old', args: ['x'] } } }),
    )
    const result = await generateMcpConfig({ projectRoot, target: 'claude-code', overwrite: true })
    expect(result.written).toBe(true)
    const parsed = JSON.parse(readFileSync(result.path, 'utf-8')) as {
      mcpServers: { vibegraph: { command: string } }
    }
    expect(parsed.mcpServers.vibegraph.command).toBe('npx')
  })

  it('MERGES vibegraph into an existing file with OTHER servers', async () => {
    const projectRoot = mkTmp()
    writeFileSync(
      join(projectRoot, '.mcp.json'),
      JSON.stringify({
        mcpServers: {
          'other-server': { command: 'node', args: ['server.js'] },
        },
        otherTopLevelField: 'preserved',
      }),
    )
    const result = await generateMcpConfig({ projectRoot, target: 'claude-code' })
    expect(result.written).toBe(true)
    expect(result.merged).toBe(true)
    const parsed = JSON.parse(readFileSync(result.path, 'utf-8')) as {
      mcpServers: { vibegraph: object; 'other-server': object }
      otherTopLevelField?: string
    }
    expect(parsed.mcpServers.vibegraph).toBeDefined()
    expect(parsed.mcpServers['other-server']).toBeDefined()
    expect(parsed.otherTopLevelField).toBe('preserved')
  })

  it('handles corrupt JSON gracefully (skip without overwrite)', async () => {
    const projectRoot = mkTmp()
    writeFileSync(join(projectRoot, '.mcp.json'), 'not json {{')
    const result = await generateMcpConfig({ projectRoot, target: 'claude-code' })
    expect(result.written).toBe(false)
    expect(result.skipped).toBe('exists')
  })

  it('overwrites corrupt JSON when overwrite=true', async () => {
    const projectRoot = mkTmp()
    writeFileSync(join(projectRoot, '.mcp.json'), 'not json {{')
    const result = await generateMcpConfig({ projectRoot, target: 'claude-code', overwrite: true })
    expect(result.written).toBe(true)
    const parsed = JSON.parse(readFileSync(result.path, 'utf-8')) as {
      mcpServers: { vibegraph: object }
    }
    expect(parsed.mcpServers.vibegraph).toBeDefined()
  })

  it('accepts custom serverEntry override', async () => {
    const projectRoot = mkTmp()
    const result = await generateMcpConfig({
      projectRoot,
      target: 'claude-code',
      serverEntry: { command: 'vibe-graph-mcp', args: [] },
    })
    expect(result.written).toBe(true)
    const parsed = JSON.parse(readFileSync(result.path, 'utf-8')) as {
      mcpServers: { vibegraph: { command: string; args: string[] } }
    }
    expect(parsed.mcpServers.vibegraph.command).toBe('vibe-graph-mcp')
    expect(parsed.mcpServers.vibegraph.args).toEqual([])
  })

  it('writes parsed valid JSON output', async () => {
    const projectRoot = mkTmp()
    await generateMcpConfig({ projectRoot, target: 'claude-code' })
    const raw = readFileSync(join(projectRoot, '.mcp.json'), 'utf-8')
    // Pretty-printed (indent: 2) with trailing newline
    expect(raw).toMatch(/\n$/)
    expect(() => JSON.parse(raw)).not.toThrow()
  })
})
