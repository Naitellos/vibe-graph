import { describe, expect, it } from 'vitest'
import { NodeSchema } from './node.js'

describe('NodeSchema', () => {
  it('parses a minimal valid Node and fills defaults', () => {
    const parsed = NodeSchema.parse({
      id: 'subsystem:oracle',
      kind: 'subsystem',
      title: 'Oracle',
    })
    expect(parsed.layer).toBe('unknown')
    expect(parsed.status).toBe('unknown')
    expect(parsed.tags).toEqual([])
    expect(parsed.files).toEqual([])
    expect(parsed.metadata).toEqual({})
  })

  it('parses a fully populated Node', () => {
    const parsed = NodeSchema.parse({
      id: 'file:server/oracle.ts',
      kind: 'file',
      title: 'oracle.ts',
      layer: 'domain',
      status: 'in-progress',
      tags: ['ai', 'chat'],
      files: ['server/oracle.ts'],
      metadata: { lineCount: 230 },
    })
    expect(parsed.tags).toEqual(['ai', 'chat'])
    expect(parsed.metadata.lineCount).toBe(230)
  })

  it('rejects nodes without id/kind/title', () => {
    expect(() => NodeSchema.parse({ kind: 'subsystem', title: 'x' })).toThrow()
    expect(() => NodeSchema.parse({ id: 'x', title: 'x' })).toThrow()
    expect(() => NodeSchema.parse({ id: 'x', kind: 'subsystem' })).toThrow()
  })

  it('rejects unknown node kinds', () => {
    expect(() => NodeSchema.parse({ id: 'x:y', kind: 'mystery', title: 't' })).toThrow()
  })
})
