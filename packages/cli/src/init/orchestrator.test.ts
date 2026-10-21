import {
  existsSync,
  mkdirSync,
  mkdtempSync,
  readFileSync,
  realpathSync,
  writeFileSync,
} from 'node:fs'
import { tmpdir } from 'node:os'
import { basename, join } from 'node:path'
import { describe, expect, it } from 'vitest'
import { type InitPrompts, runInit, yesPrompts } from './orchestrator.js'

function mkTmp(): string {
  return realpathSync(mkdtempSync(join(tmpdir(), 'vg-init-')))
}

function makeStubPrompts(answers: {
  overwrite?: boolean
  mcp?: { 'claude-code'?: boolean; cursor?: boolean }
}): InitPrompts & { calls: Array<{ method: string; args: unknown }> } {
  const calls: Array<{ method: string; args: unknown }> = []
  return {
    calls,
    async confirmOverwrite(opts) {
      calls.push({ method: 'confirmOverwrite', args: opts })
      return answers.overwrite ?? true
    },
    async confirmMcpConfig(opts) {
      calls.push({ method: 'confirmMcpConfig', args: opts })
      return answers.mcp?.[opts.ide] ?? true
    },
    log: (msg) => calls.push({ method: 'log', args: msg }),
    warn: (msg) => calls.push({ method: 'warn', args: msg }),
    success: (msg) => calls.push({ method: 'success', args: msg }),
  }
}

describe('runInit', () => {
  it('writes all 3 files on a fresh project', async () => {
    const root = mkTmp()
    writeFileSync(join(root, 'package.json'), JSON.stringify({ name: 'my-app' }))
    const prompts = makeStubPrompts({})
    const result = await runInit({ projectRoot: root, yes: true, force: false, prompts })
    expect(result.status).toBe('completed')
    expect(result.projectName).toBe('my-app')
    expect(existsSync(join(root, '.vibegraph/config.yml'))).toBe(true)
    expect(existsSync(join(root, '.vibegraphignore'))).toBe(true)
    expect(existsSync(join(root, '.gitignore'))).toBe(true)
  })

  it('strips @scope/ from project name', async () => {
    const root = mkTmp()
    writeFileSync(join(root, 'package.json'), JSON.stringify({ name: '@myorg/my-pkg' }))
    const prompts = makeStubPrompts({})
    const result = await runInit({ projectRoot: root, yes: true, force: false, prompts })
    expect(result.projectName).toBe('my-pkg')
    // config.yml has the stripped name
    const cfg = readFileSync(join(root, '.vibegraph/config.yml'), 'utf-8')
    expect(cfg).toContain('name: my-pkg')
  })

  it('falls back to directory basename when no package.json name', async () => {
    const root = mkTmp()
    // No package.json
    const prompts = makeStubPrompts({})
    const result = await runInit({ projectRoot: root, yes: true, force: false, prompts })
    expect(result.projectName).toBe(basename(root))
  })

  it('--yes skips overwrite prompt even when .vibegraph/ exists', async () => {
    const root = mkTmp()
    writeFileSync(join(root, 'package.json'), JSON.stringify({ name: 'pre-existing' }))
    mkdirSync(join(root, '.vibegraph'))
    writeFileSync(join(root, '.vibegraph/config.yml'), 'project:\n  name: old\n')
    const prompts = makeStubPrompts({})
    const result = await runInit({ projectRoot: root, yes: true, force: false, prompts })
    expect(result.status).toBe('completed')
    expect(prompts.calls.find((c) => c.method === 'confirmOverwrite')).toBeUndefined()
    // Files were overwritten because --yes + existing → overwrite=true
    const cfg = readFileSync(join(root, '.vibegraph/config.yml'), 'utf-8')
    expect(cfg).toContain('name: pre-existing')
  })

  it('without --yes and without --force, asks confirmation; user declines → aborts', async () => {
    const root = mkTmp()
    writeFileSync(join(root, 'package.json'), JSON.stringify({ name: 'x' }))
    mkdirSync(join(root, '.vibegraph'))
    const prompts = makeStubPrompts({ overwrite: false })
    const result = await runInit({ projectRoot: root, yes: false, force: false, prompts })
    expect(result.status).toBe('aborted')
    expect(result.abortReason).toContain('--force')
    expect(prompts.calls.find((c) => c.method === 'confirmOverwrite')).toBeDefined()
  })

  it('--force bypasses overwrite confirm even when .vibegraph/ exists', async () => {
    const root = mkTmp()
    writeFileSync(join(root, 'package.json'), JSON.stringify({ name: 'x' }))
    mkdirSync(join(root, '.vibegraph'))
    const prompts = makeStubPrompts({})
    const result = await runInit({ projectRoot: root, yes: false, force: true, prompts })
    expect(result.status).toBe('completed')
    expect(prompts.calls.find((c) => c.method === 'confirmOverwrite')).toBeUndefined()
  })

  it('prompts for each detected IDE; user can decline per-IDE', async () => {
    const root = mkTmp()
    writeFileSync(join(root, 'package.json'), JSON.stringify({ name: 'x' }))
    mkdirSync(join(root, '.claude')) // detected: claude-code
    mkdirSync(join(root, '.cursor')) // detected: cursor
    const prompts = makeStubPrompts({ mcp: { 'claude-code': true, cursor: false } })
    const result = await runInit({ projectRoot: root, yes: false, force: false, prompts })
    expect(result.status).toBe('completed')
    expect(existsSync(join(root, '.mcp.json'))).toBe(true) // claude-code accepted
    expect(existsSync(join(root, '.cursor/mcp.json'))).toBe(false) // cursor declined
    // Both IDEs were prompted
    const mcpPrompts = prompts.calls.filter((c) => c.method === 'confirmMcpConfig')
    expect(mcpPrompts).toHaveLength(2)
  })

  it('--yes auto-confirms all MCP configs', async () => {
    const root = mkTmp()
    writeFileSync(join(root, 'package.json'), JSON.stringify({ name: 'x' }))
    mkdirSync(join(root, '.claude'))
    mkdirSync(join(root, '.cursor'))
    const prompts = makeStubPrompts({})
    await runInit({ projectRoot: root, yes: true, force: false, prompts })
    expect(existsSync(join(root, '.mcp.json'))).toBe(true)
    expect(existsSync(join(root, '.cursor/mcp.json'))).toBe(true)
    expect(prompts.calls.find((c) => c.method === 'confirmMcpConfig')).toBeUndefined()
  })

  it('writes .cursor/rules/vibe-graph.mdc when Cursor detected', async () => {
    const { mkdir, readFile, writeFile } = await import('node:fs/promises')
    const { join } = await import('node:path')
    const { tmpdir } = await import('node:os')

    const projectRoot = join(tmpdir(), `vg-cursor-orch-${Date.now()}-${Math.random()}`)
    await mkdir(join(projectRoot, '.cursor'), { recursive: true })
    await writeFile(join(projectRoot, 'package.json'), '{"name":"t","version":"0.0.0"}\n', 'utf-8')

    const result = await runInit({
      projectRoot,
      yes: true,
      force: false,
      prompts: yesPrompts,
    })
    expect(result.status).toBe('completed')
    expect(result.steps.some((s) => s.kind === 'cursor-rules')).toBe(true)

    const mdcPath = join(projectRoot, '.cursor', 'rules', 'vibe-graph.mdc')
    const content = await readFile(mdcPath, 'utf-8')
    expect(content).toContain('prepare_task')

    await import('node:fs/promises').then((m) =>
      m.rm(projectRoot, { recursive: true, force: true }),
    )
  })

  it('detects no IDEs → no MCP config prompts', async () => {
    const root = mkTmp()
    writeFileSync(join(root, 'package.json'), JSON.stringify({ name: 'x' }))
    // No .claude, no .cursor — pass a non-existent homeDir to avoid picking up real ~/.claude
    const prompts = makeStubPrompts({})
    const result = await runInit({
      projectRoot: root,
      yes: false,
      force: false,
      prompts,
      homeDir: join(root, 'nonexistent-home'),
    })
    expect(result.status).toBe('completed')
    expect(result.detectedIdes).toEqual([])
    expect(prompts.calls.find((c) => c.method === 'confirmMcpConfig')).toBeUndefined()
  })

  it('writes the Claude Code hook file when hooks=true', async () => {
    const { mkdtemp, rm } = await import('node:fs/promises')
    const projectRoot = await mkdtemp(join(tmpdir(), 'vg-init-hooks-'))
    try {
      const result = await runInit({
        projectRoot,
        yes: true,
        force: false,
        hooks: true,
        prompts: yesPrompts,
      })
      expect(result.status).toBe('completed')
      const hookStep = result.steps.find((s) => s.kind === 'hooks')
      expect(hookStep).toBeDefined()
      if (hookStep === undefined || hookStep.kind !== 'hooks')
        throw new Error('expected hooks step')
      expect(hookStep.result.status).toBe('created')
      // File actually exists
      const { existsSync: existsSyncFs } = await import('node:fs')
      expect(existsSyncFs(hookStep.result.path)).toBe(true)
    } finally {
      await rm(projectRoot, { recursive: true, force: true })
    }
  })

  it('does NOT write hook file when hooks=false (default)', async () => {
    const { mkdtemp, rm } = await import('node:fs/promises')
    const projectRoot = await mkdtemp(join(tmpdir(), 'vg-init-no-hooks-'))
    try {
      const result = await runInit({
        projectRoot,
        yes: true,
        force: false,
        prompts: yesPrompts,
      })
      expect(result.status).toBe('completed')
      const hookStep = result.steps.find((s) => s.kind === 'hooks')
      expect(hookStep).toBeUndefined()
    } finally {
      await rm(projectRoot, { recursive: true, force: true })
    }
  })

  it('--hooks-only adds only the hook step and leaves .vibegraph untouched', async () => {
    const root = mkTmp()
    writeFileSync(join(root, 'package.json'), JSON.stringify({ name: 'pre-existing' }))
    mkdirSync(join(root, '.vibegraph'))
    writeFileSync(join(root, '.vibegraph/config.yml'), 'project:\n  name: old\n')
    const prompts = makeStubPrompts({})

    const result = await runInit({
      projectRoot: root,
      yes: false,
      force: false,
      hooksOnly: true,
      prompts,
    })

    expect(result.status).toBe('completed')
    expect(result.steps).toHaveLength(1)
    expect(result.steps[0]?.kind).toBe('hooks')
    // existing config untouched, no overwrite prompt shown
    expect(readFileSync(join(root, '.vibegraph/config.yml'), 'utf-8')).toBe(
      'project:\n  name: old\n',
    )
    expect(prompts.calls.some((c) => c.method === 'confirmOverwrite')).toBe(false)
    // hook file written
    expect(existsSync(join(root, '.claude/settings.json'))).toBe(true)
  })

  it('warns when vibe-graph is not installed (hook command would not resolve)', async () => {
    const root = mkTmp()
    writeFileSync(join(root, 'package.json'), JSON.stringify({ name: 'x' }))
    const prompts = makeStubPrompts({})

    await runInit({ projectRoot: root, yes: false, force: false, hooksOnly: true, prompts })

    const warns = prompts.calls.filter((c) => c.method === 'warn').map((c) => String(c.args))
    expect(warns.some((m) => m.includes('@codearch/cli') && /install|add|resolve/i.test(m))).toBe(
      true,
    )
  })

  it('does not warn when the vibe-graph bin is resolvable', async () => {
    const root = mkTmp()
    writeFileSync(join(root, 'package.json'), JSON.stringify({ name: 'x' }))
    mkdirSync(join(root, 'node_modules', '.bin'), { recursive: true })
    writeFileSync(join(root, 'node_modules', '.bin', 'vibe-graph'), '#!/bin/sh\n')
    const prompts = makeStubPrompts({})

    await runInit({ projectRoot: root, yes: false, force: false, hooksOnly: true, prompts })

    const warns = prompts.calls.filter((c) => c.method === 'warn').map((c) => String(c.args))
    expect(warns.some((m) => m.includes('vibe-graph') && /install|add|resolve/i.test(m))).toBe(
      false,
    )
  })

  it('writes a graph baseline so validate-diff works out of the box', async () => {
    const { mkdtemp, rm } = await import('node:fs/promises')
    const { existsSync: existsSyncFs } = await import('node:fs')
    const tmp = await mkdtemp(join(tmpdir(), 'vg-init-baseline-'))
    try {
      writeFileSync(join(tmp, 'package.json'), JSON.stringify({ name: 'baseline-test' }))
      const result = await runInit({
        projectRoot: tmp,
        yes: true,
        force: false,
        prompts: yesPrompts,
        homeDir: join(tmp, 'nonexistent-home'),
      })
      expect(result.status).toBe('completed')
      expect(existsSyncFs(join(tmp, '.vibegraph/cache/baseline.json'))).toBe(true)
    } finally {
      await rm(tmp, { recursive: true, force: true })
    }
  })
})
