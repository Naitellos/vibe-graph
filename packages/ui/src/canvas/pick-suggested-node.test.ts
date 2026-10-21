import { describe, expect, it } from 'vitest'
import { pickSuggestedNode } from './pick-suggested-node.js'

describe('pickSuggestedNode', () => {
  it('empty nodes → null', () => {
    expect(pickSuggestedNode([], [])).toBeNull()
  })

  it('single node, no edges → null (fan-in = 0)', () => {
    expect(pickSuggestedNode([{ id: 'a' }], [])).toBeNull()
  })

  it('two nodes, one edge a→b → b is suggested', () => {
    const nodes = [{ id: 'a' }, { id: 'b' }]
    const edges = [{ from: 'a', to: 'b' }]
    expect(pickSuggestedNode(nodes, edges)).toBe('b')
  })

  it('full cycle a→b→c→a (each fan-in=1) → alphabetical winner: a', () => {
    const nodes = [{ id: 'a' }, { id: 'b' }, { id: 'c' }]
    const edges = [
      { from: 'a', to: 'b' },
      { from: 'b', to: 'c' },
      { from: 'c', to: 'a' },
    ]
    // All have fan-in 1; alphabetically 'a' < 'b' < 'c' → 'a' wins
    expect(pickSuggestedNode(nodes, edges)).toBe('a')
  })

  it('tied fan-in 2: a, b, c each receive 2 incoming → a wins alphabetically', () => {
    const nodes = [{ id: 'a' }, { id: 'b' }, { id: 'c' }, { id: 'd' }, { id: 'e' }, { id: 'f' }]
    const edges = [
      // a gets 2 incoming
      { from: 'd', to: 'a' },
      { from: 'e', to: 'a' },
      // b gets 2 incoming
      { from: 'd', to: 'b' },
      { from: 'f', to: 'b' },
      // c gets 2 incoming
      { from: 'e', to: 'c' },
      { from: 'f', to: 'c' },
    ]
    expect(pickSuggestedNode(nodes, edges)).toBe('a')
  })

  it('all zero fan-in (no edges) → null', () => {
    const nodes = [{ id: 'x' }, { id: 'y' }, { id: 'z' }]
    expect(pickSuggestedNode(nodes, [])).toBeNull()
  })

  it('self-loop a→a → a has fan-in 1, returned', () => {
    const nodes = [{ id: 'a' }]
    const edges = [{ from: 'a', to: 'a' }]
    expect(pickSuggestedNode(nodes, edges)).toBe('a')
  })

  it('edge pointing to a node not in nodes list is ignored', () => {
    const nodes = [{ id: 'a' }, { id: 'b' }]
    const edges = [{ from: 'a', to: 'external' }]
    // 'external' is not in nodes, so fan-in stays 0 for a and b
    expect(pickSuggestedNode(nodes, edges)).toBeNull()
  })
})
