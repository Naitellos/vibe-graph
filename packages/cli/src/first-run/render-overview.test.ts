import type { ProjectOverview } from '@codearch/core'
import { describe, expect, it } from 'vitest'
import { renderOneLineSummary, renderOverview } from './render-overview.js'

const base: ProjectOverview = {
  project: { name: 'demo', root: '/x', snapshotBuiltAt: '', snapshotScanId: '' },
  counts: { subsystems: 12, files: 416, edges: 2018, findings: 0, externalPackages: 37 },
  layers: [
    { layer: 'app', nodeCount: 88 },
    { layer: 'core', nodeCount: 142 },
  ],
  subsystemLayers: [],
  autoDetected: false,
  topFindings: [],
  topHubs: [],
}

describe('renderOverview', () => {
  it('header uses honest "edges" label and the project name', () => {
    const s = renderOverview(base)
    expect(s).toContain('demo')
    expect(s).toContain('2018 edges')
    expect(s).not.toContain('dependencies')
  })

  it('zero findings shows the clean line', () => {
    expect(renderOverview(base)).toContain('No architecture risks found')
  })

  it('renders a finding with its evidence location', () => {
    const s = renderOverview({
      ...base,
      counts: { ...base.counts, findings: 1 },
      topFindings: [
        {
          id: 'f',
          type: 'layer-violation',
          severity: 'high',
          title: 'UI imports core',
          involvedNodeIds: [],
          location: { file: 'src/ui/P.tsx', line: 42 },
        },
      ],
    })
    expect(s).toContain('UI imports core')
    expect(s).toContain('src/ui/P.tsx:42')
  })

  it('omits hubs with zero combined degree, and the section when none remain', () => {
    const withZeroHubs = { ...base, topHubs: [{ nodeId: 'a', title: 'a', fanIn: 0, fanOut: 0 }] }
    expect(renderOverview(withZeroHubs)).not.toContain('blast radius')
    const withRealHub = {
      ...base,
      topHubs: [{ nodeId: 'core', title: 'core', fanIn: 9, fanOut: 2 }],
    }
    expect(renderOverview(withRealHub)).toContain('core')
  })

  it('one-line summary is compact', () => {
    expect(renderOneLineSummary(base)).toBe('vibe-graph: 12 subsystems · 416 files · 0 findings')
  })

  it('renders a finding with no location (no trailing :line artifact)', () => {
    const s = renderOverview({
      ...base,
      counts: { ...base.counts, findings: 1 },
      topFindings: [
        { id: 'f', type: 'orphan', severity: 'low', title: 'lonely module', involvedNodeIds: [] },
      ],
    })
    expect(s).toContain('lonely module')
    expect(s).toContain('(orphan)')
    expect(s).not.toContain('undefined')
  })

  it('omits the layers line when there are no layers', () => {
    expect(renderOverview({ ...base, layers: [] })).not.toContain('Layers')
  })

  it('renders the Layers line from subsystemLayers and shows the heuristic nudge', () => {
    const out = renderOverview({
      project: { name: 'app', root: '/x', snapshotBuiltAt: 't', snapshotScanId: 's' },
      counts: { subsystems: 2, files: 100, edges: 200, findings: 0, externalPackages: 5 },
      layers: [{ layer: 'unknown', nodeCount: 100 }],
      subsystemLayers: [
        { layer: 'domain', subsystemCount: 1 },
        { layer: 'horizontal', subsystemCount: 1 },
      ],
      autoDetected: true,
      topFindings: [],
      topHubs: [],
    })
    expect(out).toContain('Layers   domain 1 · horizontal 1')
    expect(out).toContain('refine with `vibe-graph init`')
  })
})
