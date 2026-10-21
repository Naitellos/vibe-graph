/**
 * Unit tests for readVibegraphignorePatterns().
 *
 * Tests run in a tmpdir — no persistent fixtures needed.
 */

import { mkdir, mkdtemp, rm, writeFile } from 'node:fs/promises'
import { tmpdir } from 'node:os'
import { join } from 'node:path'
import { afterEach, beforeEach, describe, expect, it } from 'vitest'
import { readVibegraphignorePatterns } from './vibegraphignore.js'

describe('readVibegraphignorePatterns()', () => {
  let tmpRoot: string

  beforeEach(async () => {
    tmpRoot = await mkdtemp(join(tmpdir(), 'vg-ignore-test-'))
  })

  afterEach(async () => {
    await rm(tmpRoot, { recursive: true, force: true })
  })

  it('returns [] when .vibegraphignore does not exist', () => {
    const patterns = readVibegraphignorePatterns(tmpRoot)
    expect(patterns).toEqual([])
  })

  it('returns trimmed non-comment non-blank lines', async () => {
    await writeFile(
      join(tmpRoot, '.vibegraphignore'),
      [
        '# This is a comment',
        '',
        '  # Another comment with leading spaces',
        'node_modules',
        'dist',
        '',
        'build',
        '  # trailing comment',
        '*.log',
      ].join('\n'),
      'utf-8',
    )

    const patterns = readVibegraphignorePatterns(tmpRoot)
    expect(patterns).toEqual(['node_modules', 'dist', 'build', '*.log'])
  })

  it('preserves !negation patterns', async () => {
    await writeFile(
      join(tmpRoot, '.vibegraphignore'),
      ['dist', '!dist/important.js', 'coverage'].join('\n'),
      'utf-8',
    )

    const patterns = readVibegraphignorePatterns(tmpRoot)
    expect(patterns).toEqual(['dist', '!dist/important.js', 'coverage'])
    expect(patterns).toContain('!dist/important.js')
  })

  it('handles a file with only comments and blank lines → returns []', async () => {
    await writeFile(
      join(tmpRoot, '.vibegraphignore'),
      ['# comment 1', '', '# comment 2', '  ', ''].join('\n'),
      'utf-8',
    )

    const patterns = readVibegraphignorePatterns(tmpRoot)
    expect(patterns).toEqual([])
  })

  it('trims whitespace around pattern lines', async () => {
    await writeFile(
      join(tmpRoot, '.vibegraphignore'),
      ['  fixtures/  ', '\tskipme\t'].join('\n'),
      'utf-8',
    )

    const patterns = readVibegraphignorePatterns(tmpRoot)
    expect(patterns).toEqual(['fixtures/', 'skipme'])
  })
})
