import { describe, expect, it } from 'vitest'
import { type LayoutInput, computeGraphLayout } from './graph-layout.js'

const fourNodeInput: LayoutInput = {
  nodes: [{ id: 'a' }, { id: 'b' }, { id: 'c' }, { id: 'd' }],
  edges: [
    { id: 'a-b', from: 'a', to: 'b' },
    { id: 'b-c', from: 'b', to: 'c' },
    { id: 'b-d', from: 'b', to: 'd' },
  ],
}

describe('computeGraphLayout', () => {
  describe('basic output shape', () => {
    it('returns all 4 nodes with finite x,y', () => {
      const out = computeGraphLayout(fourNodeInput)
      expect(out.nodes).toHaveLength(4)
      for (const n of out.nodes) {
        expect(typeof n.x).toBe('number')
        expect(typeof n.y).toBe('number')
        expect(Number.isFinite(n.x)).toBe(true)
        expect(Number.isFinite(n.y)).toBe(true)
      }
    })

    it('returns 3 edges with matching ids', () => {
      const out = computeGraphLayout(fourNodeInput)
      expect(out.edges).toHaveLength(3)
      const ids = out.edges.map((e) => e.id).sort()
      expect(ids).toEqual(['a-b', 'b-c', 'b-d'])
    })

    it('each edge has at least 2 points', () => {
      const out = computeGraphLayout(fourNodeInput)
      for (const e of out.edges) {
        expect(e.points.length).toBeGreaterThanOrEqual(2)
        for (const p of e.points) {
          expect(Number.isFinite(p.x)).toBe(true)
          expect(Number.isFinite(p.y)).toBe(true)
        }
      }
    })

    it('width and height are positive numbers', () => {
      const out = computeGraphLayout(fourNodeInput)
      expect(out.width).toBeGreaterThan(0)
      expect(out.height).toBeGreaterThan(0)
    })
  })

  describe('rank ordering (LR layout)', () => {
    it('a.x < b.x < c.x', () => {
      const out = computeGraphLayout(fourNodeInput)
      const node = (id: string) => {
        const n = out.nodes.find((m) => m.id === id)
        if (!n) throw new Error(`node ${id} missing`)
        return n
      }
      expect(node('a').x).toBeLessThan(node('b').x)
      expect(node('b').x).toBeLessThan(node('c').x)
    })

    it('b.x < d.x', () => {
      const out = computeGraphLayout(fourNodeInput)
      const node = (id: string) => {
        const n = out.nodes.find((m) => m.id === id)
        if (!n) throw new Error(`node ${id} missing`)
        return n
      }
      expect(node('b').x).toBeLessThan(node('d').x)
    })

    it('c and d are at the same rank (c.x === d.x)', () => {
      const out = computeGraphLayout(fourNodeInput)
      const node = (id: string) => {
        const n = out.nodes.find((m) => m.id === id)
        if (!n) throw new Error(`node ${id} missing`)
        return n
      }
      expect(node('c').x).toBeCloseTo(node('d').x, 1)
    })
  })

  describe('determinism', () => {
    it('two calls with same input produce deep-equal output', () => {
      const out1 = computeGraphLayout(fourNodeInput)
      const out2 = computeGraphLayout(fourNodeInput)
      // Sort both by id for stable comparison
      out1.nodes.sort((a, b) => a.id.localeCompare(b.id))
      out2.nodes.sort((a, b) => a.id.localeCompare(b.id))
      out1.edges.sort((a, b) => a.id.localeCompare(b.id))
      out2.edges.sort((a, b) => a.id.localeCompare(b.id))
      expect(out1).toEqual(out2)
    })

    it('input with different order produces same positions', () => {
      const shuffled: LayoutInput = {
        nodes: [{ id: 'd' }, { id: 'a' }, { id: 'c' }, { id: 'b' }],
        edges: [
          { id: 'b-d', from: 'b', to: 'd' },
          { id: 'a-b', from: 'a', to: 'b' },
          { id: 'b-c', from: 'b', to: 'c' },
        ],
      }
      const out1 = computeGraphLayout(fourNodeInput)
      const out2 = computeGraphLayout(shuffled)

      const norm = (out: ReturnType<typeof computeGraphLayout>) => {
        const nodes = out.nodes.slice().sort((a, b) => a.id.localeCompare(b.id))
        const edges = out.edges.slice().sort((a, b) => a.id.localeCompare(b.id))
        return { nodes, edges, width: out.width, height: out.height }
      }
      expect(norm(out1)).toEqual(norm(out2))
    })
  })

  describe('edge cases', () => {
    it('single-node input returns one node with finite coords', () => {
      const out = computeGraphLayout({ nodes: [{ id: 'solo' }], edges: [] })
      expect(out.nodes).toHaveLength(1)
      expect(out.nodes[0]?.id).toBe('solo')
      expect(Number.isFinite(out.nodes[0]?.x)).toBe(true)
      expect(Number.isFinite(out.nodes[0]?.y)).toBe(true)
    })

    it('empty-edges input produces all nodes', () => {
      const out = computeGraphLayout({
        nodes: [{ id: 'x' }, { id: 'y' }, { id: 'z' }],
        edges: [],
      })
      expect(out.nodes).toHaveLength(3)
      const ids = out.nodes.map((n) => n.id).sort()
      expect(ids).toEqual(['x', 'y', 'z'])
    })

    it('cyclic graph (a->b, b->a) does not throw', () => {
      expect(() =>
        computeGraphLayout({
          nodes: [{ id: 'a' }, { id: 'b' }],
          edges: [
            { id: 'a-b', from: 'a', to: 'b' },
            { id: 'b-a', from: 'b', to: 'a' },
          ],
        }),
      ).not.toThrow()
    })

    it('cyclic graph produces 2 nodes with finite coords', () => {
      const out = computeGraphLayout({
        nodes: [{ id: 'a' }, { id: 'b' }],
        edges: [
          { id: 'a-b', from: 'a', to: 'b' },
          { id: 'b-a', from: 'b', to: 'a' },
        ],
      })
      expect(out.nodes).toHaveLength(2)
      for (const n of out.nodes) {
        expect(Number.isFinite(n.x)).toBe(true)
        expect(Number.isFinite(n.y)).toBe(true)
      }
    })
  })

  describe('options passthrough', () => {
    it('wider gapX produces wider layout', () => {
      const narrow = computeGraphLayout({ ...fourNodeInput, options: { gapX: 100 } })
      const wide = computeGraphLayout({ ...fourNodeInput, options: { gapX: 400 } })
      expect(wide.width).toBeGreaterThan(narrow.width)
    })

    it('taller gapY produces taller layout', () => {
      const short = computeGraphLayout({ ...fourNodeInput, options: { gapY: 40 } })
      const tall = computeGraphLayout({ ...fourNodeInput, options: { gapY: 200 } })
      expect(tall.height).toBeGreaterThan(short.height)
    })
  })
})
