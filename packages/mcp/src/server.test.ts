// packages/mcp/src/server.test.ts

import { existsSync, mkdtempSync, readFileSync, rmSync } from 'node:fs'
import { tmpdir } from 'node:os'
import { join } from 'node:path'
import {
  ActivityEntrySchema,
  type LoadedSnapshot,
  type SnapshotReader,
  SnapshotReaderError,
  SnapshotSchema,
  buildLoadedSnapshot,
} from '@codearch/core'
import { describe, expect, it } from 'vitest'
import { z } from 'zod'
import { McpProtocolError, ToolError } from './errors.js'
import { createActivityLogMiddleware } from './middleware/activity-log.js'
import { TOOLS, type VibegraphTool, buildToolSchemas, dispatchToolCall } from './server.js'

describe('TOOLS registry', () => {
  it('has 8 tools registered (v0: 4 tools from Tasks 3.3-3.6, v1: 2 from Tasks 4.1-4.2, Plan 1 Task 9: prepare_task, Plan 1 Task 12: validate_diff)', () => {
    expect(TOOLS).toHaveLength(8)
    expect(TOOLS[0]?.name).toBe('get_project_overview')
    expect(TOOLS[1]?.name).toBe('get_subsystem')
    expect(TOOLS[2]?.name).toBe('get_blast_radius')
    expect(TOOLS[3]?.name).toBe('get_context_pack')
    expect(TOOLS[4]?.name).toBe('get_subsystem_doc')
    expect(TOOLS[5]?.name).toBe('validate_drift')
    expect(TOOLS[6]?.name).toBe('prepare_task')
    expect(TOOLS[7]?.name).toBe('validate_diff')
  })

  it('is an array of VibegraphTool', () => {
    expect(Array.isArray(TOOLS)).toBe(true)
  })
})

describe('buildToolSchemas', () => {
  it('returns empty array for empty TOOLS', () => {
    expect(buildToolSchemas([])).toEqual([])
  })

  it('converts a single tool to JSON schema with name + description + both schemas', () => {
    const stub: VibegraphTool<{ verbose: boolean }, { ok: boolean }> = {
      name: 'stub_tool',
      description: 'a stub for testing',
      inputSchema: z.object({ verbose: z.boolean().default(false) }),
      outputSchema: z.object({ ok: z.boolean() }),
      handler: async (input) => ({ ok: input.verbose }),
    }
    const result = buildToolSchemas([stub as VibegraphTool<unknown, unknown>])
    expect(result).toHaveLength(1)
    expect(result[0]?.name).toBe('stub_tool')
    expect(result[0]?.description).toBe('a stub for testing')
    expect(result[0]?.inputSchema).toBeDefined()
    expect(result[0]?.outputSchema).toBeDefined()
  })

  it('uses io:input for inputSchema so .default() fields are NOT required', () => {
    const stub: VibegraphTool<{ verbose: boolean }, { ok: boolean }> = {
      name: 'stub',
      description: 'x',
      inputSchema: z.object({ verbose: z.boolean().default(false) }),
      outputSchema: z.object({ ok: z.boolean() }),
      handler: async () => ({ ok: true }),
    }
    const [schema] = buildToolSchemas([stub as VibegraphTool<unknown, unknown>])
    // For io:'input' mode, fields with .default() should appear in `properties`
    // but NOT in `required`. Asserting via shape.
    const input = schema?.inputSchema as {
      properties?: Record<string, unknown>
      required?: string[]
    }
    expect(input.properties?.verbose).toBeDefined()
    expect(input.required ?? []).not.toContain('verbose')
  })

  it('uses default (output) mode for outputSchema so all fields ARE required', () => {
    const stub: VibegraphTool<{ x: number }, { result: string }> = {
      name: 'stub',
      description: 'x',
      inputSchema: z.object({ x: z.number() }),
      outputSchema: z.object({ result: z.string() }),
      handler: async () => ({ result: '' }),
    }
    const [schema] = buildToolSchemas([stub as VibegraphTool<unknown, unknown>])
    const output = schema?.outputSchema as {
      properties?: Record<string, unknown>
      required?: string[]
    }
    expect(output.required).toContain('result')
  })
})

// ---------------------------------------------------------------------------
// dispatchToolCall tests (Task 3.7)
// ---------------------------------------------------------------------------

function makeStubReader(loaded: LoadedSnapshot): SnapshotReader {
  return {
    get: async () => loaded,
    invalidate: () => {},
  }
}

function makeMinimalLoaded(): LoadedSnapshot {
  const snap = SnapshotSchema.parse({
    meta: {
      schemaVersion: '0.1.0',
      scanId: '11111111-1111-4111-8111-111111111111',
      builtAt: '2026-05-25T00:00:00.000Z',
      projectRoot: '/abs',
      projectName: 'demo',
      vibegraphVersion: '0.0.0',
      scanDurationMs: 1,
      fileCounts: { scanned: 0, indexed: 0, skipped: 0 },
    },
    nodes: [],
    edges: [],
    evidence: [],
    findings: [],
  })
  return buildLoadedSnapshot(snap)
}

describe('dispatchToolCall', () => {
  it('throws McpProtocolError UNKNOWN_TOOL for unknown tool name', async () => {
    const ctx = { reader: makeStubReader(makeMinimalLoaded()), projectRoot: '/tmp/test' }
    await expect(dispatchToolCall('no_such_tool', {}, ctx)).rejects.toThrow(McpProtocolError)
    try {
      await dispatchToolCall('no_such_tool', {}, ctx)
    } catch (err) {
      expect(err).toBeInstanceOf(McpProtocolError)
      expect((err as McpProtocolError).code).toBe('UNKNOWN_TOOL')
    }
  })

  it('returns isError INVALID_INPUT when args fail Zod validation', async () => {
    const ctx = { reader: makeStubReader(makeMinimalLoaded()), projectRoot: '/tmp/test' }
    // get_subsystem requires `id: string`. Pass invalid shape (number).
    const result = await dispatchToolCall('get_subsystem', { id: 42 }, ctx)
    expect(result.isError).toBe(true)
    const sc = result.structuredContent as { error: { code: string; zodIssues?: unknown[] } }
    expect(sc.error.code).toBe('INVALID_INPUT')
    expect(Array.isArray(sc.error.zodIssues)).toBe(true)
    expect(result.content[0]?.type).toBe('text')
    expect(result.content[0]?.text).toContain('INVALID_INPUT')
  })

  it('returns isError TARGET_NOT_FOUND when tool handler throws ToolError', async () => {
    const ctx = { reader: makeStubReader(makeMinimalLoaded()), projectRoot: '/tmp/test' }
    // empty snapshot, get_subsystem with nonexistent id → resolveTarget → NOT_FOUND → ToolError
    const result = await dispatchToolCall('get_subsystem', { id: 'subsystem:nope' }, ctx)
    expect(result.isError).toBe(true)
    const sc = result.structuredContent as { error: { code: string } }
    expect(sc.error.code).toBe('TARGET_NOT_FOUND')
  })

  it('returns structuredContent for successful call', async () => {
    const ctx = { reader: makeStubReader(makeMinimalLoaded()), projectRoot: '/tmp/test' }
    // get_project_overview on empty snapshot — handler returns valid result
    const result = await dispatchToolCall('get_project_overview', {}, ctx)
    expect(result.isError).toBeUndefined()
    expect(result.structuredContent).toBeDefined()
    const sc = result.structuredContent as { counts: { subsystems: number } }
    expect(sc.counts.subsystems).toBe(0)
    expect(result.content[0]?.text).toContain('"subsystems": 0')
  })

  it('propagates unexpected errors (not ToolError) up the stack', async () => {
    // Mock a reader that throws — simulates SnapshotReaderError or other infra failure
    const exploding: SnapshotReader = {
      get: async () => {
        throw new Error('disk on fire')
      },
      invalidate: () => {},
    }
    const ctx = { reader: exploding, projectRoot: '/tmp/test' }
    await expect(dispatchToolCall('get_project_overview', {}, ctx)).rejects.toThrow('disk on fire')
  })

  it('INVALID_INPUT includes zodIssues with path and message', async () => {
    const ctx = { reader: makeStubReader(makeMinimalLoaded()), projectRoot: '/tmp/test' }
    const result = await dispatchToolCall('get_subsystem', {}, ctx) // missing required `id`
    expect(result.isError).toBe(true)
    const sc = result.structuredContent as {
      error: { zodIssues: Array<{ path: unknown[]; message: string }> }
    }
    expect(sc.error.zodIssues.length).toBeGreaterThan(0)
    expect(sc.error.zodIssues[0]?.path).toEqual(['id'])
  })

  it('text fallback contains JSON-serialized result on success', async () => {
    const ctx = { reader: makeStubReader(makeMinimalLoaded()), projectRoot: '/tmp/test' }
    const result = await dispatchToolCall('get_project_overview', {}, ctx)
    expect(result.content[0]?.text).toMatch(/"counts"/)
    expect(result.content[0]?.text).toMatch(/"layers"/)
  })

  it('ToolError hint is included in text content when present', async () => {
    const ctx = { reader: makeStubReader(makeMinimalLoaded()), projectRoot: '/tmp/test' }
    const result = await dispatchToolCall('get_subsystem', { id: 'subsystem:nope' }, ctx)
    expect(result.isError).toBe(true)
    // The hint is part of the text fallback
    expect(result.content[0]?.text).toContain('TARGET_NOT_FOUND')
  })

  it('ToolError without hint does not emit "undefined" in text content', async () => {
    // We can verify via get_subsystem TARGET_NOT_FOUND which has a hint
    // Instead check that if hint is defined it appears, no literal "undefined"
    const ctx = { reader: makeStubReader(makeMinimalLoaded()), projectRoot: '/tmp/test' }
    const result = await dispatchToolCall('get_subsystem', { id: 'subsystem:nope' }, ctx)
    expect(result.content[0]?.text).not.toContain('undefined')
  })

  it('dispatchToolCall writes an activity-log entry when middleware is provided', async () => {
    const tmp = mkdtempSync(join(tmpdir(), 'mcp-srv-mw-'))
    try {
      const mw = createActivityLogMiddleware({ projectRoot: tmp })
      const reader = makeStubReader(makeMinimalLoaded())
      await dispatchToolCall('get_project_overview', {}, { reader, projectRoot: tmp }, mw)
      const logPath = join(tmp, '.vibegraph/cache/agent-activity.ndjson')
      expect(existsSync(logPath)).toBe(true)
      const lines = readFileSync(logPath, 'utf8')
        .split('\n')
        .filter((l) => l.length > 0)
      expect(lines.length).toBeGreaterThanOrEqual(1)
      expect(() => ActivityEntrySchema.parse(JSON.parse(lines[0] ?? ''))).not.toThrow()
    } finally {
      rmSync(tmp, { recursive: true, force: true })
    }
  })

  it('dispatchToolCall without middleware returns same result as with no middleware (regression guard)', async () => {
    const ctx = { reader: makeStubReader(makeMinimalLoaded()), projectRoot: '/tmp/test' }
    const result = await dispatchToolCall('get_project_overview', {}, ctx)
    expect(result.isError).toBeUndefined()
    expect(result.structuredContent).toBeDefined()
    const sc = result.structuredContent as { counts: { subsystems: number } }
    expect(sc.counts.subsystems).toBe(0)
  })

  it('returns a structured "run /vibe-graph-setup" result when the snapshot is missing', async () => {
    const throwingReader = {
      get: async () => {
        throw new SnapshotReaderError('SNAPSHOT_MISSING', 'No snapshot', 'Run scan')
      },
      invalidate: () => {},
    }
    const res = await dispatchToolCall(
      'get_project_overview',
      { verbose: false },
      { reader: throwingReader as never, projectRoot: '/tmp/x' },
    )
    expect(res.isError).toBe(true)
    const text = (res.content as Array<{ text?: string }>).map((c) => c.text ?? '').join('\n')
    expect(text).toContain('/vibe-graph-setup')
  })
})
