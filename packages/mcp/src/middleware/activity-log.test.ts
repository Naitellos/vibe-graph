import { existsSync, mkdtempSync, readFileSync, rmSync } from 'node:fs'
import { tmpdir } from 'node:os'
import { join } from 'node:path'
import { ActivityEntrySchema, ValidateDiffUiPayloadSchema } from '@codearch/core'
import { afterEach, beforeEach, describe, expect, it } from 'vitest'
import { createActivityLogMiddleware } from './activity-log.js'

let tmpRoot: string
beforeEach(() => {
  tmpRoot = mkdtempSync(join(tmpdir(), 'vibegraph-activity-'))
})
afterEach(() => {
  rmSync(tmpRoot, { recursive: true, force: true })
})

function readEntries(): unknown[] {
  const path = join(tmpRoot, '.vibegraph/cache/agent-activity.ndjson')
  return readFileSync(path, 'utf8')
    .split('\n')
    .filter((l) => l.length > 0)
    .map((l) => JSON.parse(l))
}

describe('createActivityLogMiddleware', () => {
  it('appends one NDJSON entry per tool call (ok status)', async () => {
    const mw = createActivityLogMiddleware({ projectRoot: tmpRoot })
    const inner = async () => ({ structuredContent: { ok: true }, content: [] })
    await mw('get_subsystem', { name: 'auth' }, inner)
    const entries = readEntries()
    expect(entries).toHaveLength(1)
    const parsed = ActivityEntrySchema.parse(entries[0])
    expect(parsed.tool).toBe('get_subsystem')
    expect(parsed.status).toBe('ok')
    expect(parsed.durationMs).toBeGreaterThanOrEqual(0)
  })
  it('records error status when inner throws', async () => {
    const mw = createActivityLogMiddleware({ projectRoot: tmpRoot })
    const inner = async () => {
      throw new Error('boom')
    }
    await expect(mw('x', {}, inner)).rejects.toThrow('boom')
    const parsed = ActivityEntrySchema.parse(readEntries()[0])
    expect(parsed.status).toBe('error')
    expect(parsed.errorMessage).toBe('boom')
  })
  it('redacts secrets in args and result', async () => {
    const mw = createActivityLogMiddleware({ projectRoot: tmpRoot })
    const inner = async () => ({
      structuredContent: { tokenInResult: 'sk-1234567890abcdef1234567890abcdef12345678' },
      content: [],
    })
    await mw('x', { authHeader: 'Bearer sk-1234567890abcdef1234567890abcdef12345678' }, inner)
    const [entry] = readEntries() as {
      argsRedacted: string
      resultRedacted?: string
      redactions: number
    }[]
    expect(entry.argsRedacted).not.toContain('sk-1234567890abcdef')
    expect(entry.resultRedacted).toBeDefined()
    expect(entry.resultRedacted ?? '').not.toContain('sk-1234567890abcdef')
    expect(entry.redactions).toBeGreaterThanOrEqual(2)
  })
  it('truncates args > LIMIT_BYTES and sets truncated=true', async () => {
    const mw = createActivityLogMiddleware({ projectRoot: tmpRoot, limitBytes: 100 })
    const big = 'a'.repeat(500)
    const inner = async () => ({ structuredContent: {}, content: [] })
    await mw('x', { payload: big }, inner)
    const [entry] = readEntries() as { argsRedacted: string; truncated: boolean }[]
    expect(entry.truncated).toBe(true)
    expect(entry.argsRedacted.length).toBeLessThanOrEqual(100 + 32)
    expect(entry.argsRedacted).toContain('(truncated)')
  })
  it('records error status when result.isError is true (no summary, no resultRedacted)', async () => {
    const mw = createActivityLogMiddleware({ projectRoot: tmpRoot })
    const inner = async () => ({
      isError: true,
      structuredContent: { error: { code: 'TARGET_NOT_FOUND', message: 'no subsystem' } },
      content: [],
    })
    await mw('prepare_task', { intent: 'something' }, inner) // does NOT throw — isError is a returned result
    const parsed = ActivityEntrySchema.parse(readEntries()[0])
    expect(parsed.status).toBe('error')
    expect(parsed.errorMessage).toBe('no subsystem')
    expect(parsed.summary).toBeUndefined()
    expect(parsed.resultRedacted).toBeUndefined()
  })
  it('summary heuristic for validate_diff', async () => {
    const mw = createActivityLogMiddleware({ projectRoot: tmpRoot })
    const inner = async () => ({
      structuredContent: {
        status: 'warn',
        newViolations: [{}],
        removedViolations: [],
        newFindings: [{}, {}],
        removedFindings: [{}],
      },
      content: [],
    })
    await mw('validate_diff', {}, inner)
    const [entry] = readEntries() as { summary?: string }[]
    expect(entry.summary).toContain('warn')
    expect(entry.summary).toContain('1 new violation')
    expect(entry.summary).toContain('2 new finding')
    expect(entry.summary).toContain('1 resolved')
  })
  it('prepare_task summary truncates intent over 40 chars with ellipsis', async () => {
    const mw = createActivityLogMiddleware({ projectRoot: tmpRoot })
    const longIntent = 'x'.repeat(50)
    const inner = async () => ({
      structuredContent: { requiredContext: { files: [] }, rules: [] },
      content: [],
    })
    await mw('prepare_task', { intent: longIntent }, inner)
    const [entry] = readEntries() as { summary?: string }[]
    expect(entry.summary).toContain('…')
  })
  it('summary heuristic for prepare_task', async () => {
    const mw = createActivityLogMiddleware({ projectRoot: tmpRoot })
    const inner = async () => ({
      structuredContent: {
        target: { files: ['a.ts', 'b.ts'] },
        requiredContext: { files: ['a.ts', 'b.ts', 'c.ts', 'd.ts'] },
        rules: [{ id: 'r1' }, { id: 'r2' }],
      },
      content: [],
    })
    await mw('prepare_task', { intent: 'refactor auth subsystem' }, inner)
    const [entry] = readEntries() as { summary?: string }[]
    expect(entry.summary).toBeDefined()
    expect(entry.summary).toContain('refactor auth subsystem')
    expect(entry.summary).toContain('4 files')
    expect(entry.summary).toContain('2 rules')
  })

  // Sidecar (agent-events.ndjson) tests
  const minimalValidateDiffOutput = {
    status: 'ok' as const,
    summary: '',
    baselineSnapshotId: 'b',
    newViolations: [],
    removedViolations: [],
    newFindings: [],
    removedFindings: [],
    graphDelta: { newEdges: [], removedEdges: [], newNodes: [], removedNodes: [] },
    scope: {
      taskLinked: false,
      plannedFiles: [],
      changedFiles: [],
      deletedFiles: [],
      outOfScopeFiles: [],
      omittedGraphDelta: { newEdges: 0, removedEdges: 0, newNodes: 0, removedNodes: 0 },
    },
    riskDelta: { blastRadius: {} },
    recommendations: [],
    missingTests: [],
  }

  const eventsPath = () => join(tmpRoot, '.vibegraph/cache/agent-events.ndjson')

  it('Test A: writes a ValidateDiffUiPayload sidecar line for a successful validate_diff call', async () => {
    const mw = createActivityLogMiddleware({ projectRoot: tmpRoot })
    const inner = async () => ({ structuredContent: minimalValidateDiffOutput, content: [] })
    await mw('validate_diff', {}, inner)
    expect(existsSync(eventsPath())).toBe(true)
    const lines = readFileSync(eventsPath(), 'utf8')
      .split('\n')
      .filter((l) => l.length > 0)
    expect(lines).toHaveLength(1)
    ValidateDiffUiPayloadSchema.parse(JSON.parse(lines[0]))
  })

  it('Test B: does NOT write to the sidecar for non-validate_diff tools', async () => {
    const mw = createActivityLogMiddleware({ projectRoot: tmpRoot })
    const inner = async () => ({ structuredContent: { ok: true }, content: [] })
    await mw('get_project_overview', {}, inner)
    expect(existsSync(eventsPath())).toBe(false)
  })

  it('Test C: does NOT write to the sidecar when validate_diff inner throws', async () => {
    const mw = createActivityLogMiddleware({ projectRoot: tmpRoot })
    const inner = async (): Promise<{ structuredContent: unknown; content: unknown[] }> => {
      throw new Error('inner failure')
    }
    await expect(mw('validate_diff', {}, inner)).rejects.toThrow('inner failure')
    expect(existsSync(eventsPath())).toBe(false)
  })
})
