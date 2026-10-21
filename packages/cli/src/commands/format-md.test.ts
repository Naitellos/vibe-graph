import { describe, expect, it } from 'vitest'
import { escapeMdCell, mdFooter } from './format-md.js'

describe('escapeMdCell', () => {
  it('escapes pipe characters so table cells do not break', () => {
    expect(escapeMdCell('a | b')).toBe('a \\| b')
  })

  it('collapses newlines to spaces so a multi-line title stays in one row', () => {
    expect(escapeMdCell('line1\nline2')).toBe('line1 line2')
    expect(escapeMdCell('a\r\nb')).toBe('a b')
  })

  it('neutralizes angle brackets to prevent HTML injection in the comment', () => {
    expect(escapeMdCell('<script>')).toBe('&lt;script&gt;')
  })

  it('leaves plain strings unchanged', () => {
    expect(escapeMdCell('no special chars')).toBe('no special chars')
  })

  it('strips C0 control characters and DEL', () => {
    expect(escapeMdCell('a\x01b\x1bc\x7fd')).toBe('abcd')
  })

  it('collapses tabs to a space', () => {
    expect(escapeMdCell('a\tb')).toBe('a b')
  })
})

describe('mdFooter', () => {
  it('produces a sub-line followed by the marker on the next line', () => {
    const footer = mdFooter('<!-- vibe-graph-check -->')
    expect(footer).toBe(
      '<sub>Evidence-based · local-first · source never leaves your runner.</sub>\n<!-- vibe-graph-check -->',
    )
  })
})
