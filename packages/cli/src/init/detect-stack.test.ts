import { mkdirSync, mkdtempSync, realpathSync, writeFileSync } from 'node:fs'
import { tmpdir } from 'node:os'
import { join } from 'node:path'
import { describe, expect, it } from 'vitest'
import { detectStack } from './detect-stack.js'

function mkTmp(): string {
  return realpathSync(mkdtempSync(join(tmpdir(), 'vg-stack-')))
}

describe('detectStack', () => {
  it('returns javascript when no tsconfig + no typescript dep', async () => {
    const projectRoot = mkTmp()
    writeFileSync(join(projectRoot, 'package.json'), JSON.stringify({ name: 'plain-js' }))
    const result = await detectStack({ projectRoot })
    expect(result.language).toBe('javascript')
  })

  it('returns typescript when tsconfig.json present', async () => {
    const projectRoot = mkTmp()
    writeFileSync(join(projectRoot, 'tsconfig.json'), '{}')
    writeFileSync(join(projectRoot, 'package.json'), JSON.stringify({ name: 'ts-by-config' }))
    const result = await detectStack({ projectRoot })
    expect(result.language).toBe('typescript')
  })

  it('returns typescript when typescript is a dep', async () => {
    const projectRoot = mkTmp()
    writeFileSync(
      join(projectRoot, 'package.json'),
      JSON.stringify({ name: 'ts-by-dep', devDependencies: { typescript: '^5.0' } }),
    )
    const result = await detectStack({ projectRoot })
    expect(result.language).toBe('typescript')
  })

  it('detects pnpm via packageManager field', async () => {
    const projectRoot = mkTmp()
    writeFileSync(
      join(projectRoot, 'package.json'),
      JSON.stringify({ name: 'x', packageManager: 'pnpm@9.15.0' }),
    )
    const result = await detectStack({ projectRoot })
    expect(result.packageManager).toBe('pnpm')
  })

  it('detects yarn via yarn.lock', async () => {
    const projectRoot = mkTmp()
    writeFileSync(join(projectRoot, 'package.json'), JSON.stringify({ name: 'x' }))
    writeFileSync(join(projectRoot, 'yarn.lock'), '# yarn')
    const result = await detectStack({ projectRoot })
    expect(result.packageManager).toBe('yarn')
  })

  it('detects npm via package-lock.json', async () => {
    const projectRoot = mkTmp()
    writeFileSync(join(projectRoot, 'package.json'), JSON.stringify({ name: 'x' }))
    writeFileSync(join(projectRoot, 'package-lock.json'), '{}')
    const result = await detectStack({ projectRoot })
    expect(result.packageManager).toBe('npm')
  })

  it('returns unknown packageManager when no markers present', async () => {
    const projectRoot = mkTmp()
    writeFileSync(join(projectRoot, 'package.json'), JSON.stringify({ name: 'x' }))
    const result = await detectStack({ projectRoot })
    expect(result.packageManager).toBe('unknown')
  })

  it('detects pnpm monorepo via pnpm-workspace.yaml', async () => {
    const projectRoot = mkTmp()
    writeFileSync(join(projectRoot, 'package.json'), JSON.stringify({ name: 'mono' }))
    writeFileSync(join(projectRoot, 'pnpm-workspace.yaml'), 'packages:\n  - "packages/*"\n')
    const result = await detectStack({ projectRoot })
    expect(result.monorepo).toBe(true)
  })

  it('detects npm/yarn monorepo via workspaces array', async () => {
    const projectRoot = mkTmp()
    writeFileSync(
      join(projectRoot, 'package.json'),
      JSON.stringify({ name: 'mono', workspaces: ['packages/*'] }),
    )
    const result = await detectStack({ projectRoot })
    expect(result.monorepo).toBe(true)
  })

  it('detects npm/yarn monorepo via workspaces object', async () => {
    const projectRoot = mkTmp()
    writeFileSync(
      join(projectRoot, 'package.json'),
      JSON.stringify({ name: 'mono', workspaces: { packages: ['packages/*'] } }),
    )
    const result = await detectStack({ projectRoot })
    expect(result.monorepo).toBe(true)
  })

  it('returns monorepo: false when no workspace markers', async () => {
    const projectRoot = mkTmp()
    writeFileSync(join(projectRoot, 'package.json'), JSON.stringify({ name: 'flat' }))
    const result = await detectStack({ projectRoot })
    expect(result.monorepo).toBe(false)
  })

  it('detects frameworks via deps', async () => {
    const projectRoot = mkTmp()
    writeFileSync(
      join(projectRoot, 'package.json'),
      JSON.stringify({
        name: 'web-app',
        dependencies: { react: '^18.0', next: '^14.0', express: '^4.0' },
      }),
    )
    const result = await detectStack({ projectRoot })
    expect(result.frameworks).toContain('react')
    expect(result.frameworks).toContain('next')
    expect(result.frameworks).toContain('express')
  })

  it('returns empty frameworks for no matching deps', async () => {
    const projectRoot = mkTmp()
    writeFileSync(join(projectRoot, 'package.json'), JSON.stringify({ name: 'minimal' }))
    const result = await detectStack({ projectRoot })
    expect(result.frameworks).toEqual([])
  })

  it('handles missing package.json gracefully', async () => {
    const projectRoot = mkTmp()
    const result = await detectStack({ projectRoot })
    expect(result.language).toBe('javascript')
    expect(result.packageManager).toBe('unknown')
    expect(result.monorepo).toBe(false)
    expect(result.frameworks).toEqual([])
  })

  it('handles malformed package.json gracefully', async () => {
    const projectRoot = mkTmp()
    writeFileSync(join(projectRoot, 'package.json'), '{ not json }')
    const result = await detectStack({ projectRoot })
    expect(result.language).toBe('javascript')
    expect(result.packageManager).toBe('unknown')
  })
})
