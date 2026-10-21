export const MCP_PACKAGE_NAME = '@codearch/mcp' as const

export * from './errors.js'
export {
  TOOLS,
  buildToolSchemas,
  dispatchToolCall,
  startMcpServer,
  type CallToolResult,
  type McpServerOptions,
  type ToolHandlerContext,
  type ToolSchema,
  type VibegraphTool,
} from './server.js'
export { buildOverview, type ProjectOverview } from '@codearch/core'
export type { GetProjectOverviewOutputT } from './tools/get-project-overview.js'
// Note: bin.ts is the entry script — not re-exported (it has side effects).
