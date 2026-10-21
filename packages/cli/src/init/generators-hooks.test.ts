import { mkdir, mkdtemp, readFile, rm, writeFile } from 'node:fs/promises'
import { tmpdir } from 'node:os'
import { join } from 'node:path'
import { afterEach, beforeEach, describe, expect, it } from 'vitest'
import { generateClaudeCodeHook, hookCommand } from './generators-hooks.js'

describe('hookCommand', () => {
  it('uses pnpm exec for pnpm', () => {
    expect(hookCommand('pnpm')).toBe('pnpm exec vibe-graph validate-diff --json --hook')
  })
  it('uses yarn exec for yarn', () => {
    expect(hookCommand('yarn')).toBe('yarn exec vibe-graph validate-diff --json --hook')
  })
  it('uses npx for npm and unknown', () => {
    expect(hookCommand('npm')).toBe('npx -y @codearch/cli validate-diff --json --hook')
    expect(hookCommand('unknown')).toBe('npx -y @codearch/cli validate-diff --json --hook')
  })
})

describe('generateClaudeCodeHook', () => {
  let projectRoot: string

  beforeEach(async () => {
    projectRoot = await mkdtemp(join(tmpdir(), 'vg-hooks-'))
  })

  afterEach(async () => {
    await rm(projectRoot, { recursive: true, force: true })
  })

  const SETTINGS_RELATIVE = join('.claude', 'settings.json')

  it('creates .claude/settings.json with canonical PostToolUse shape when absent', async () => {
    const r = await generateClaudeCodeHook({ projectRoot })
    expect(r.status).toBe('created')
    if (r.status !== 'created') throw new Error('expected created')
    expect(r.path).toBe(join(projectRoot, SETTINGS_RELATIVE))

    const written = JSON.parse(await readFile(r.path, 'utf-8'))
    expect(written.hooks?.PostToolUse).toHaveLength(1)
    const entry = written.hooks.PostToolUse[0]
    expect(entry.matcher).toBe('Edit|Write')
    expect(entry.hooks).toHaveLength(1)
    expect(entry.hooks[0]).toEqual({
      type: 'command',
      command: 'npx -y @codearch/cli validate-diff --json --hook',
      timeout: 30, // seconds, not milliseconds
    })
  })

  it('preserves other top-level settings keys when merging into existing file', async () => {
    const settingsPath = join(projectRoot, SETTINGS_RELATIVE)
    await mkdir(join(projectRoot, '.claude'), { recursive: true })
    await writeFile(
      settingsPath,
      `${JSON.stringify(
        {
          model: 'claude-opus-4-5',
          permissions: { allow: ['Read(**)', 'Bash(npm:*)'] },
          hooks: {},
        },
        null,
        2,
      )}\n`,
    )

    const r = await generateClaudeCodeHook({ projectRoot })
    expect(r.status).toBe('merged')

    const written = JSON.parse(await readFile(settingsPath, 'utf-8'))
    expect(written.model).toBe('claude-opus-4-5')
    expect(written.permissions.allow).toEqual(['Read(**)', 'Bash(npm:*)'])
    expect(written.hooks.PostToolUse).toHaveLength(1)
    expect(written.hooks.PostToolUse[0].matcher).toBe('Edit|Write')
  })

  it('appends without disturbing other PostToolUse entries', async () => {
    const settingsPath = join(projectRoot, SETTINGS_RELATIVE)
    await mkdir(join(projectRoot, '.claude'), { recursive: true })
    const otherEntry = {
      matcher: 'Bash',
      hooks: [{ type: 'command' as const, command: 'echo bash-fired', timeout: 5 }],
    }
    await writeFile(
      settingsPath,
      `${JSON.stringify({ hooks: { PostToolUse: [otherEntry] } }, null, 2)}\n`,
    )

    const r = await generateClaudeCodeHook({ projectRoot })
    expect(r.status).toBe('merged')

    const written = JSON.parse(await readFile(settingsPath, 'utf-8'))
    expect(written.hooks.PostToolUse).toHaveLength(2)
    expect(written.hooks.PostToolUse[0]).toEqual(otherEntry)
    expect(written.hooks.PostToolUse[1].hooks[0].command).toBe(
      'npx -y @codearch/cli validate-diff --json --hook',
    )
  })

  it('idempotent — our hook already present, no force → status exists, file unchanged', async () => {
    const settingsPath = join(projectRoot, SETTINGS_RELATIVE)
    await mkdir(join(projectRoot, '.claude'), { recursive: true })
    const initialPayload = {
      hooks: {
        PostToolUse: [
          {
            matcher: 'Edit|Write',
            hooks: [
              {
                type: 'command',
                command: 'npx -y @codearch/cli validate-diff --json --hook',
                timeout: 5,
              },
            ],
          },
        ],
      },
    }
    const initialBytes = `${JSON.stringify(initialPayload, null, 2)}\n`
    await writeFile(settingsPath, initialBytes)

    const r = await generateClaudeCodeHook({ projectRoot })
    expect(r.status).toBe('exists')

    const after = await readFile(settingsPath, 'utf-8')
    expect(after).toBe(initialBytes) // byte-identical, no write occurred
  })

  it('force=true replaces our entry (no duplicates) and leaves others intact', async () => {
    const settingsPath = join(projectRoot, SETTINGS_RELATIVE)
    await mkdir(join(projectRoot, '.claude'), { recursive: true })
    const otherEntry = {
      matcher: 'Bash',
      hooks: [{ type: 'command', command: 'echo bash', timeout: 5 }],
    }
    const ourEntryStale = {
      matcher: 'Edit|Write',
      hooks: [
        {
          type: 'command',
          command: 'npx -y @codearch/cli validate-diff --json --hook',
          timeout: 99, // stale value
        },
      ],
    }
    await writeFile(
      settingsPath,
      `${JSON.stringify({ hooks: { PostToolUse: [otherEntry, ourEntryStale] } }, null, 2)}\n`,
    )

    const r = await generateClaudeCodeHook({ projectRoot, force: true })
    expect(r.status).toBe('replaced')

    const written = JSON.parse(await readFile(settingsPath, 'utf-8'))
    expect(written.hooks.PostToolUse).toHaveLength(2)
    // other entry preserved
    expect(written.hooks.PostToolUse[0]).toEqual(otherEntry)
    // our entry replaced (timeout back to canonical 30)
    expect(written.hooks.PostToolUse[1].hooks[0].timeout).toBe(30)
  })

  it('returns error on malformed existing settings.json (refuses to overwrite)', async () => {
    const settingsPath = join(projectRoot, SETTINGS_RELATIVE)
    await mkdir(join(projectRoot, '.claude'), { recursive: true })
    const garbage = '{not valid json,'
    await writeFile(settingsPath, garbage)

    const r = await generateClaudeCodeHook({ projectRoot })
    expect(r.status).toBe('error')
    if (r.status !== 'error') throw new Error('expected error')
    expect(r.error).toContain('settings.json')

    // File untouched
    const after = await readFile(settingsPath, 'utf-8')
    expect(after).toBe(garbage)
  })
})
