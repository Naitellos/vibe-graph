# @codearch/cli

> A graph-based vibe coding cockpit and MCP context provider for TypeScript codebases.

vibe-graph scans your TypeScript monorepo into a navigable graph of subsystems, dependencies, and findings. Use the cockpit UI to explore visually, or expose the graph to an AI assistant via the bundled MCP server — get precise blast-radius and context-pack answers grounded in your real codebase.

## Install

```bash
npm i -g @codearch/cli
```

Or run on-demand:

```bash
npx @codearch/cli init
```

## Quick start

### 1. Init — set up the project

Generates a default `.vibegraph/config.yml`, adds entries to `.gitignore`, ready in seconds.

```bash
npx @codearch/cli init
```

### 2. Scan — build a snapshot

Walks your TypeScript sources, extracts subsystems and dependencies, detects cycles and orphans, writes `.vibegraph/cache/graph.json`.

```bash
npx @codearch/cli scan
```

### 3. MCP — expose the graph to AI

Starts an MCP server (stdio) that AI assistants can call for project overview, blast radius, context pack, and subsystem detail.

```bash
npx @codearch/cli mcp --project-root .
```

## Other commands

`vibe-graph` (no args) launches the cockpit web UI. `baseline`, `check`, `validate-diff`, `impact`, `context`, and `doctor` are also available — run `vibe-graph --help`.

## Cockpit

`vibe-graph` (no args) opens the cockpit in your browser at `http://localhost:5173`.

### Change Mode

Top-tab **Change** in Cockpit visualizes `prepare_task`. Fill intent + select paths
(autocomplete from your project's file index) + pick mode → get the same 6 sections
the MCP tool surfaces, plus one-click Copy as Markdown / Copy JSON for handoff to
Claude Code, Cursor, or any agent.

### Agent Activity Log

Top-tab **Activity** in Cockpit shows a live timeline of MCP tool calls — useful
for watching what your agent actually does. Entries are persisted to
`.vibegraph/cache/agent-activity.ndjson` (rotated at 10MB), with secrets redacted
and oversized args/results truncated. Click an entry to expand the (redacted)
args and result.

## Connect to your IDE

`npx @codearch/cli init` auto-detects Claude Code and Cursor and writes their MCP configs. For other clients, drop one of these snippets into the appropriate config file:

**Windsurf** (`.windsurf/mcp.json` or workspace settings)
```json
{ "mcpServers": { "vibegraph": { "command": "npx", "args": ["-y", "@codearch/cli", "mcp"] } } }
```

**Cline** (VS Code → Cline extension settings → MCP Servers JSON)
```json
{ "mcpServers": { "vibegraph": { "command": "npx", "args": ["-y", "@codearch/cli", "mcp"] } } }
```

**Continue.dev** (`~/.continue/config.json` → `experimental.modelContextProtocolServers`)
```json
{ "name": "vibegraph", "command": "npx", "args": ["-y", "@codearch/cli", "mcp"] }
```

**Zed** (`~/.config/zed/settings.json` → `context_servers`)
```json
{ "vibegraph": { "command": { "path": "npx", "args": ["-y", "@codearch/cli", "mcp"] } } }
```

**Codex** (`~/.codex/config.toml`)
```toml
[mcp_servers.vibegraph]
command = "npx"
args = ["-y", "@codearch/cli", "mcp"]
```

**Any stdio MCP client** (generic)
```
command: npx -y @codearch/cli mcp
```

After wiring the MCP config, reload the client and ask the agent: _"Use vibe-graph to plan refactor of X."_ The agent will call `prepare_task` for preflight context and `validate_diff` post-edit for verdict.

## Documentation

- Contributing: [CONTRIBUTING.md](https://github.com/Naitellos/vibe-graph/blob/main/CONTRIBUTING.md)

## License

MIT
