import { existsSync } from 'node:fs'
import { readFile } from 'node:fs/promises'
import { join } from 'node:path'
import { which } from './system.js'
import type { Check, CheckResult } from './types.js'

interface McpJsonShape {
  mcpServers?: Record<string, { command?: string; args?: string[] }>
}

export const mcpJsonCheck: Check = {
  id: 'integrations/mcp-json',
  description: '.mcp.json parses and configured commands resolve',
  async run(ctx): Promise<CheckResult> {
    const path = join(ctx.projectRoot, '.mcp.json')
    if (!existsSync(path)) {
      return {
        id: mcpJsonCheck.id,
        status: 'info',
        message: 'No .mcp.json — Claude Code MCP integration not configured for this project',
      }
    }
    let parsed: McpJsonShape
    try {
      const raw = await readFile(path, 'utf-8')
      parsed = JSON.parse(raw) as McpJsonShape
    } catch (err) {
      return {
        id: mcpJsonCheck.id,
        status: 'warn',
        message: `.mcp.json failed to parse: ${err instanceof Error ? err.message : String(err)}`,
        suggestion: 'Fix the JSON syntax or delete and re-run `npx @codearch/cli init`',
      }
    }

    const servers = parsed.mcpServers ?? {}
    const serverNames = Object.keys(servers)
    if (serverNames.length === 0) {
      return {
        id: mcpJsonCheck.id,
        status: 'warn',
        message: '.mcp.json has no mcpServers entries',
        suggestion: 'Run `npx @codearch/cli init` to add the vibegraph MCP server',
      }
    }

    // Check each server's command resolves
    const missing: string[] = []
    for (const [name, cfg] of Object.entries(servers)) {
      if (cfg.command === undefined || cfg.command.length === 0) continue
      if (which(cfg.command) === null) {
        missing.push(`${name} → '${cfg.command}'`)
      }
    }
    if (missing.length > 0) {
      return {
        id: mcpJsonCheck.id,
        status: 'warn',
        message: `.mcp.json references command(s) not on PATH: ${missing.join(', ')}`,
        suggestion: 'Install the missing tool(s) or update .mcp.json command paths',
      }
    }

    return {
      id: mcpJsonCheck.id,
      status: 'ok',
      message: `.mcp.json valid with ${serverNames.length} server(s): ${serverNames.join(', ')}`,
    }
  },
}

export const INTEGRATION_CHECKS: readonly Check[] = [mcpJsonCheck]
