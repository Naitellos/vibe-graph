export type ToolErrorCode =
  | 'SNAPSHOT_MISSING'
  | 'SNAPSHOT_CORRUPT'
  | 'TARGET_NOT_FOUND'
  | 'TARGET_AMBIGUOUS'
  | 'BUDGET_EXCEEDED'
  | 'NO_BASELINE'
  | 'SNAPSHOT_STALE'
  | 'INVALID_INPUT'

/**
 * Tool-originated error. Returned as { isError: true, structuredContent: { error: {...} } }
 * per MCP spec 2025-06-18 — gives the agent structured feedback to self-correct.
 */
export class ToolError extends Error {
  constructor(
    public readonly code: ToolErrorCode,
    message: string,
    public readonly hint?: string,
    public readonly suggestions?: readonly string[],
  ) {
    super(message)
    this.name = 'ToolError'
  }
}

/**
 * Protocol-level error. Thrown — becomes a JSON-RPC error response.
 * v0 surface has only UNKNOWN_TOOL (unknown tool name). Malformed framing is
 * handled by the MCP SDK itself.
 */
export class McpProtocolError extends Error {
  constructor(
    public readonly code: 'UNKNOWN_TOOL',
    message: string,
  ) {
    super(message)
    this.name = 'McpProtocolError'
  }
}
