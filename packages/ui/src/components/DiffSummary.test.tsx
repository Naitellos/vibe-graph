import { render, screen } from '@testing-library/react'
import { userEvent } from '@testing-library/user-event'
import { beforeEach, describe, expect, it } from 'vitest'
import { useDiffStore } from '../state/diff.js'
import { DiffSummary } from './DiffSummary.js'

const delta = (over = {}) =>
  ({
    status: 'warn',
    baselineSnapshotId: 'b',
    edges: { added: [], removed: [] },
    nodes: { added: [], removed: [] },
    blastRadius: [],
    violations: { added: [], removed: [] },
    findings: { added: [], removed: [] },
    counts: {
      addedEdges: 2,
      removedEdges: 1,
      newViolations: 1,
      removedViolations: 0,
      newFindings: 0,
      resolvedFindings: 3,
      ...over,
    },
  }) as never

describe('DiffSummary', () => {
  beforeEach(() => useDiffStore.getState().clear())

  it('renders nothing when inactive', () => {
    const { container } = render(<DiffSummary />)
    expect(container).toBeEmptyDOMElement()
  })

  it('shows status + edge/violation counts when active', () => {
    useDiffStore.setState({ active: true, delta: delta() })
    render(<DiffSummary />)
    expect(screen.getByTestId('diff-summary')).toBeInTheDocument()
    expect(screen.getByTestId('diff-summary').textContent).toMatch(/warn/i)
    expect(screen.getByTestId('diff-summary').textContent).toMatch(/\+2/) // added edges
    expect(screen.getByTestId('diff-summary').textContent).toMatch(/[−-]1/) // removed edges (minus or hyphen)
    expect(screen.getByTestId('diff-summary').textContent).toMatch(/3/) // resolved findings
  })

  it('Clear diff button calls clear()', async () => {
    useDiffStore.setState({ active: true, delta: delta() })
    render(<DiffSummary />)
    const user = userEvent.setup()
    await user.click(screen.getByRole('button', { name: /clear diff/i }))
    expect(useDiffStore.getState().active).toBe(false)
  })

  it('empty delta (no changes) shows a no-changes message', () => {
    useDiffStore.setState({
      active: true,
      delta: delta({
        addedEdges: 0,
        removedEdges: 0,
        newViolations: 0,
        removedViolations: 0,
        newFindings: 0,
        resolvedFindings: 0,
      }),
    })
    render(<DiffSummary />)
    expect(screen.getByTestId('diff-summary').textContent).toMatch(/no graph changes/i)
  })

  it('blast-only delta is NOT reported as "no changes" and shows blast text', () => {
    const blastOnly = {
      status: 'warn',
      baselineSnapshotId: 'b',
      edges: { added: [], removed: [] },
      nodes: { added: [], removed: [] },
      blastRadius: [{ id: 'subsystem:core', before: 1, after: 2, delta: '+1' }],
      violations: { added: [], removed: [] },
      findings: { added: [], removed: [] },
      counts: {
        addedEdges: 0,
        removedEdges: 0,
        newViolations: 0,
        removedViolations: 0,
        newFindings: 0,
        resolvedFindings: 0,
      },
    } as never
    useDiffStore.setState({ active: true, delta: blastOnly })
    render(<DiffSummary />)
    const text = screen.getByTestId('diff-summary').textContent ?? ''
    expect(text).not.toMatch(/no graph changes/i)
    expect(text).toMatch(/blast/i)
  })

  it('node-only diff (zero counts) is NOT reported as "no changes"', () => {
    const nodeOnly = {
      status: 'warn',
      baselineSnapshotId: 'b',
      edges: { added: [], removed: [] },
      nodes: { added: [{ id: 'subsystem:new', kind: 'subsystem', title: 'new' }], removed: [] },
      blastRadius: [],
      violations: { added: [], removed: [] },
      findings: { added: [], removed: [] },
      counts: {
        addedEdges: 0,
        removedEdges: 0,
        newViolations: 0,
        removedViolations: 0,
        newFindings: 0,
        resolvedFindings: 0,
      },
    } as never
    useDiffStore.setState({ active: true, delta: nodeOnly })
    render(<DiffSummary />)
    const text = screen.getByTestId('diff-summary').textContent ?? ''
    expect(text).not.toMatch(/no graph changes/i)
    expect(text).toMatch(/\+1.*subsystem/i)
  })
})
