// packages/mcp/src/tools/get-context-pack.test.ts

import { mkdirSync, mkdtempSync, realpathSync, writeFileSync } from 'node:fs'
import { tmpdir } from 'node:os'
import { dirname, join } from 'node:path'
import { scan } from '@codearch/core'
import { buildLoadedSnapshot } from '@codearch/core'
import { describe, expect, it } from 'vitest'
import { ToolError } from '../errors.js'
import { GetContextPackTool, runContextPack } from './get-context-pack.js'

function mkTmp(): string {
  return realpathSync(mkdtempSync(join(tmpdir(), 'vg-ctxpack-')))
}

function touch(root: string, relPath: string, body = ''): void {
  const abs = join(root, relPath)
  mkdirSync(dirname(abs), { recursive: true })
  writeFileSync(abs, body)
}

describe('GetContextPackTool metadata', () => {
  it('has name + description + schemas', () => {
    expect(GetContextPackTool.name).toBe('get_context_pack')
    expect(GetContextPackTool.description).toBeTruthy()
    expect(GetContextPackTool.inputSchema).toBeDefined()
    expect(GetContextPackTool.outputSchema).toBeDefined()
  })
})

describe('runContextPack', () => {
  it('builds a valid ContextPack for a subsystem target', async () => {
    const root = mkTmp()
    writeFileSync(join(root, 'package.json'), JSON.stringify({ name: 'ctxpack-fixture' }))
    writeFileSync(
      join(root, 'tsconfig.json'),
      JSON.stringify({
        compilerOptions: {
          strict: true,
          target: 'ES2022',
          module: 'NodeNext',
          moduleResolution: 'NodeNext',
        },
        include: ['src/**/*'],
      }),
    )
    touch(root, 'src/auth/index.ts', 'export const auth = 1\n')
    touch(
      root,
      'src/auth/login.ts',
      "import { auth } from './index.js'\nconst x = auth\nexport {}\n",
    )
    touch(
      root,
      'src/billing/index.ts',
      "import { auth } from '../auth/index.js'\nexport const charge = () => auth\n",
    )

    const snapshot = await scan({ root })
    const loaded = buildLoadedSnapshot(snapshot)

    const pack = await runContextPack(loaded, {
      target: 'subsystem:auth',
      budget: { maxTokens: 8000, maxFiles: 10 },
    })

    expect(pack.id).toMatch(/^ctx_[0-9a-f]{16}$/)
    expect(pack.target).toBe('subsystem:auth')
    expect(pack.tokenBudget).toBe(8000)
    expect(pack.tokenEstimateMethod).toBe('char-div-4')
    expect(pack.summary).toBeTruthy()
    expect(pack.criticalFiles.length).toBeGreaterThan(0)
    expect(pack.metadata.redactions).toBeUndefined() // no secrets
  }, 30_000)

  it('redacts secrets and populates metadata.redactions', async () => {
    const root = mkTmp()
    writeFileSync(join(root, 'package.json'), JSON.stringify({ name: 'secret-fixture' }))
    writeFileSync(
      join(root, 'tsconfig.json'),
      JSON.stringify({
        compilerOptions: {
          strict: true,
          target: 'ES2022',
          module: 'NodeNext',
          moduleResolution: 'NodeNext',
        },
        include: ['src/**/*'],
      }),
    )
    // file with a hardcoded OpenAI-style key
    touch(
      root,
      'src/auth/secret.ts',
      "// auth helper\nexport const OPENAI_KEY = 'sk-abc1234567890ABC123456'\nexport const auth = OPENAI_KEY\n",
    )
    touch(root, 'src/auth/index.ts', "export { auth } from './secret.js'\n")

    const snapshot = await scan({ root })
    const loaded = buildLoadedSnapshot(snapshot)

    const pack = await runContextPack(loaded, {
      target: 'subsystem:auth',
      budget: { maxTokens: 8000, maxFiles: 10 },
    })

    expect(pack.metadata.redactions).toBeDefined()
    expect(pack.metadata.redactions?.totalCount).toBeGreaterThanOrEqual(1)
    expect(pack.metadata.redactions?.byKind['openai-key']).toBeGreaterThanOrEqual(1)
    // The secret file's excerpt should contain the REDACTED marker, NOT the actual key
    const secretFile = pack.criticalFiles.find((f) => f.path.endsWith('secret.ts'))
    expect(secretFile?.excerpt).toContain('<REDACTED:openai-key>')
    expect(secretFile?.excerpt ?? '').not.toContain('sk-abc1234567890ABC123456')
  }, 30_000)

  it('throws TARGET_NOT_FOUND for unknown target', async () => {
    const root = mkTmp()
    writeFileSync(join(root, 'package.json'), JSON.stringify({ name: 'empty' }))
    touch(root, 'src/a.ts', 'export const a = 1\n')

    const snapshot = await scan({ root })
    const loaded = buildLoadedSnapshot(snapshot)

    await expect(
      runContextPack(loaded, {
        target: 'subsystem:nonexistent',
        budget: { maxTokens: 8000, maxFiles: 10 },
      }),
    ).rejects.toThrow(ToolError)
  }, 30_000)

  it('respects budget cap (small maxTokens)', async () => {
    const root = mkTmp()
    writeFileSync(join(root, 'package.json'), JSON.stringify({ name: 'budget-test' }))
    writeFileSync(
      join(root, 'tsconfig.json'),
      JSON.stringify({
        compilerOptions: {
          strict: true,
          target: 'ES2022',
          module: 'NodeNext',
          moduleResolution: 'NodeNext',
        },
        include: ['src/**/*'],
      }),
    )
    touch(root, 'src/big/a.ts', `${'a'.repeat(2000)}\n`)
    touch(root, 'src/big/b.ts', `${'b'.repeat(2000)}\n`)
    touch(root, 'src/big/index.ts', 'export const x = 1\n')

    const snapshot = await scan({ root })
    const loaded = buildLoadedSnapshot(snapshot)

    const pack = await runContextPack(loaded, {
      target: 'subsystem:big',
      budget: { maxTokens: 100, maxFiles: 10 }, // tiny
    })
    expect(pack.tokenBudget).toBe(100)
    // At least some criticalFiles should have excerpt=undefined when overbudget
    expect(pack.criticalFiles.some((f) => f.excerpt === undefined)).toBe(true)
  }, 30_000)

  it('passes intent through (currently informational, no behavior change)', async () => {
    const root = mkTmp()
    writeFileSync(join(root, 'package.json'), JSON.stringify({ name: 'intent-test' }))
    writeFileSync(
      join(root, 'tsconfig.json'),
      JSON.stringify({
        compilerOptions: {
          strict: true,
          target: 'ES2022',
          module: 'NodeNext',
          moduleResolution: 'NodeNext',
        },
        include: ['src/**/*'],
      }),
    )
    touch(root, 'src/auth/index.ts', 'export const x = 1\n')

    const snapshot = await scan({ root })
    const loaded = buildLoadedSnapshot(snapshot)

    const pack = await runContextPack(loaded, {
      target: 'subsystem:auth',
      budget: { maxTokens: 8000, maxFiles: 10 },
      intent: 'add 2FA support',
    })
    // intent doesn't change output shape in v0 — just confirm pack is valid
    expect(pack.target).toBe('subsystem:auth')
  }, 30_000)
})
