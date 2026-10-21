import { describe, expect, it } from 'vitest'
import { topHubsByFanIn } from './top-hubs.js'

describe('topHubsByFanIn', () => {
  it('returns empty array for empty nodes', () => {
    expect(topHubsByFanIn([], [])).toEqual([])
  })

  it('returns empty array when there are no subsystem nodes', () => {
    const nodes = [
      { id: 'file-a', kind: 'file' },
      { id: 'pkg-b', kind: 'package' },
    ]
    const edges = [{ from: 'file-a', to: 'pkg-b' }]
    expect(topHubsByFanIn(nodes, edges)).toEqual([])
  })

  it('filters out non-subsystem nodes', () => {
    const nodes = [
      { id: 'sub-a', kind: 'subsystem' },
      { id: 'file-b', kind: 'file' },
    ]
    const edges = [
      { from: 'x', to: 'sub-a' },
      { from: 'x', to: 'file-b' },
    ]
    const result = topHubsByFanIn(nodes, edges)
    expect(result).toHaveLength(1)
    expect(result[0]?.id).toBe('sub-a')
    // file-b should not appear
    expect(result.find((r) => r.id === 'file-b')).toBeUndefined()
  })

  it('returns sorted by fan-in descending', () => {
    const nodes = [
      { id: 'sub-a', kind: 'subsystem' },
      { id: 'sub-b', kind: 'subsystem' },
      { id: 'sub-c', kind: 'subsystem' },
    ]
    const edges = [
      { from: 'x', to: 'sub-b' },
      { from: 'y', to: 'sub-b' },
      { from: 'z', to: 'sub-b' },
      { from: 'x', to: 'sub-a' },
      { from: 'y', to: 'sub-a' },
      // sub-c has 0 fan-in
    ]
    const result = topHubsByFanIn(nodes, edges)
    expect(result[0]).toEqual({ id: 'sub-b', fanIn: 3 })
    expect(result[1]).toEqual({ id: 'sub-a', fanIn: 2 })
    expect(result[2]).toEqual({ id: 'sub-c', fanIn: 0 })
  })

  it('breaks ties alphabetically by id (earlier id wins)', () => {
    const nodes = [
      { id: 'sub-z', kind: 'subsystem' },
      { id: 'sub-a', kind: 'subsystem' },
      { id: 'sub-m', kind: 'subsystem' },
    ]
    const edges = [
      { from: 'x', to: 'sub-z' },
      { from: 'x', to: 'sub-a' },
      { from: 'x', to: 'sub-m' },
    ]
    const result = topHubsByFanIn(nodes, edges)
    expect(result.map((r) => r.id)).toEqual(['sub-a', 'sub-m', 'sub-z'])
  })

  it('respects the limit parameter', () => {
    const nodes = [
      { id: 'sub-a', kind: 'subsystem' },
      { id: 'sub-b', kind: 'subsystem' },
      { id: 'sub-c', kind: 'subsystem' },
      { id: 'sub-d', kind: 'subsystem' },
      { id: 'sub-e', kind: 'subsystem' },
      { id: 'sub-f', kind: 'subsystem' },
    ]
    const edges = [
      { from: 'x', to: 'sub-f' },
      { from: 'x', to: 'sub-e' },
      { from: 'x', to: 'sub-d' },
      { from: 'x', to: 'sub-c' },
      { from: 'x', to: 'sub-b' },
      { from: 'x', to: 'sub-a' },
    ]
    const result = topHubsByFanIn(nodes, edges, 3)
    expect(result).toHaveLength(3)
  })

  it('returns fewer than limit when there are not enough nodes', () => {
    const nodes = [
      { id: 'sub-a', kind: 'subsystem' },
      { id: 'sub-b', kind: 'subsystem' },
    ]
    const edges = [{ from: 'x', to: 'sub-a' }]
    const result = topHubsByFanIn(nodes, edges, 5)
    expect(result).toHaveLength(2)
  })
})
