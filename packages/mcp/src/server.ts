// packages/mcp/src/server.ts

import { type SnapshotReader, SnapshotReaderError } from '@codearch/core'
import { Server } from '@modelcontextprotocol/sdk/server/index.js'
import { StdioServerTransport } from '@modelcontextprotocol/sdk/server/stdio.js'
import {
  CallToolRequestSchema,
  ListToolsRequestSchema,
  type Result,
} from '@modelcontextprotocol/sdk/types.js'
import { z } from 'zod'
import { McpProtocolError, ToolError } from './errors.js'
import { type Middleware, createActivityLogMiddleware } from './middleware/activity-log.js'
import { GetBlastRadiusTool } from './tools/get-blast-radius.js'
import { GetContextPackTool } from './tools/get-context-pack.js'
import { GetProjectOverviewTool } from './tools/get-project-overview.js'
import { GetSubsystemDocTool } from './tools/get-subsystem-doc.js'
import { GetSubsystemTool } from './tools/get-subsystem.js'
import { PrepareTaskTool } from './tools/prepare-task.js'
import { ValidateDiffTool } from './tools/validate-diff.js'
import { ValidateDriftTool } from './tools/validate-drift.js'

const VIBEGRAPH_VERSION = '0.0.0' // v0; later sourced from package.json

/**
 * Vibegraph tool contract. Each tool declares its name, description,
 * input/output Zod schemas, and a handler that receives validated input
 * plus a context with a SnapshotReader for graph access.
 */
export interface VibegraphTool<I, O> {
  name: string
  description: string
  inputSchema: z.ZodType<I>
  outputSchema: z.ZodType<O>
  handler: (input: I, ctx: ToolHandlerContext) => Promise<O>
  /** Compact text fallback for clients that do not consume structuredContent. */
  formatText?: (output: O) => string
}

export interface ToolHandlerContext {
  reader: SnapshotReader
  projectRoot: string
}

/**
 * The v0 tools (Tasks 3.3-3.6) plus v1 tools (Tasks 4.1-4.2).
 * Order preserves the first 4 for backward compat in tools/list responses.
 */
export const TOOLS: VibegraphTool<unknown, unknown>[] = [
  GetProjectOverviewTool as VibegraphTool<unknown, unknown>,
  GetSubsystemTool as VibegraphTool<unknown, unknown>,
  GetBlastRadiusTool as VibegraphTool<unknown, unknown>,
  GetContextPackTool as VibegraphTool<unknown, unknown>,
  GetSubsystemDocTool as VibegraphTool<unknown, unknown>,
  ValidateDriftTool as VibegraphTool<unknown, unknown>,
  PrepareTaskTool as VibegraphTool<unknown, unknown>,
  ValidateDiffTool as VibegraphTool<unknown, unknown>,
]

/**
 * Precompute JSON Schema descriptors for tools/list at module load.
 *
 * CRITICAL: input schemas use io: 'input' so .default() fields stay optional
 * in the published JSON Schema. Output schemas use plain mode — the agent's
 * SDK will validate tool responses against these.
 */
export function buildToolSchemas(
  tools: ReadonlyArray<VibegraphTool<unknown, unknown>>,
): ToolSchema[] {
  return tools.map((t) => ({
    name: t.name,
    description: t.description,
    inputSchema: z.toJSONSchema(t.inputSchema, { io: 'input' }),
    outputSchema: z.toJSONSchema(t.outputSchema),
  }))
}

export interface ToolSchema {
  name: string
  description: string
  inputSchema: unknown
  outputSchema: unknown
}

export interface McpServerOptions {
  /** SnapshotReader instance (constructed by the caller — Task 3.8 wires this). */
  reader: SnapshotReader
  /** Absolute path to the project root; used by middleware (e.g. activity-log) to resolve paths. */
  projectRoot: string
}

export interface CallToolResult {
  structuredContent?: unknown
  content: Array<{ type: 'text'; text: string }>
  isError?: boolean
}

/**
 * Dispatch a tools/call request against the TOOLS registry.
 * - Unknown tool name → throws McpProtocolError (becomes JSON-RPC error upstream)
 * - Input validation fail → returns { isError: true, structuredContent: { error: { code: 'INVALID_INPUT', ... } } }
 * - Tool handler throws ToolError → returns { isError: true, structuredContent: { error: { code: ..., ... } } }
 * - Success → returns { structuredContent: result, content: [text fallback] }
 *
 * Other (unexpected) errors propagate up — they become JSON-RPC errors via the SDK.
 */
export async function dispatchToolCall(
  toolName: string,
  args: unknown,
  ctx: ToolHandlerContext,
  middleware?: Middleware,
): Promise<CallToolResult> {
  const inner = async (): Promise<CallToolResult> => {
    const tool = TOOLS.find((t) => t.name === toolName)
    if (!tool) {
      throw new McpProtocolError('UNKNOWN_TOOL', `No tool: ${toolName}`)
    }

    const parsed = tool.inputSchema.safeParse(args ?? {})
    if (!parsed.success) {
      return {
        isError: true,
        structuredContent: {
          error: {
            code: 'INVALID_INPUT' as const,
            message: 'Tool input failed schema validation',
            hint: 'See inputSchema in tools/list; check field names and types',
            zodIssues: parsed.error.issues,
          },
        },
        content: [{ type: 'text', text: `INVALID_INPUT: ${formatZodError(parsed.error)}` }],
      }
    }

    try {
      const result = await tool.handler(parsed.data, ctx)
      return {
        structuredContent: result,
        content: [
          {
            type: 'text',
            text: tool.formatText?.(result) ?? JSON.stringify(result, null, 2),
          },
        ],
      }
    } catch (err) {
      if (err instanceof SnapshotReaderError && err.code === 'SNAPSHOT_MISSING') {
        return {
          isError: true,
          content: [
            {
              type: 'text',
              text: 'No vibe-graph snapshot yet — run /vibe-graph-setup (or `npx vibe-graph scan`) in this project first.',
            },
          ],
        }
      }
      if (err instanceof ToolError) {
        return {
          isError: true,
          structuredContent: {
            error: {
              code: err.code,
              message: err.message,
              ...(err.hint !== undefined ? { hint: err.hint } : {}),
              ...(err.suggestions !== undefined ? { suggestions: err.suggestions } : {}),
            },
          },
          content: [
            {
              type: 'text',
              text: `${err.code}: ${err.message}${err.hint ? `\n${err.hint}` : ''}`,
            },
          ],
        }
      }
      // Unexpected error — propagate (becomes JSON-RPC error via SDK)
      throw err
    }
  }
  if (middleware !== undefined) return middleware(toolName, args, inner)
  return inner()
}

function formatZodError(err: z.ZodError): string {
  return err.issues
    .map((issue) => `${issue.path.join('.') || '<root>'}: ${issue.message}`)
    .join('; ')
}

/**
 * Start the MCP server over stdio.
 * - ListTools handler returns precomputed schemas for TOOLS.
 * - CallTool handler delegates to dispatchToolCall (Task 3.7).
 * Returns a promise that resolves once the transport is connected.
 */
export async function startMcpServer(opts: McpServerOptions): Promise<void> {
  const toolSchemas = buildToolSchemas(TOOLS)
  const activityMiddleware = createActivityLogMiddleware({ projectRoot: opts.projectRoot })

  const server = new Server(
    { name: 'vibegraph', version: VIBEGRAPH_VERSION },
    { capabilities: { tools: {} } },
  )

  server.setRequestHandler(ListToolsRequestSchema, async () => ({ tools: toolSchemas }))

  server.setRequestHandler(CallToolRequestSchema, async (request) => {
    const result = await dispatchToolCall(
      request.params.name,
      request.params.arguments,
      { reader: opts.reader, projectRoot: opts.projectRoot },
      activityMiddleware,
    )
    // structuredContent is not in this SDK version's type but flows through at runtime
    // (CallToolResultSchema is a passthrough schema). Cast through unknown to satisfy TS.
    return result as unknown as Result
  })

  const transport = new StdioServerTransport()
  await server.connect(transport)
}
