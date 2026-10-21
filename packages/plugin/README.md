# @codearch/plugin

**Catches your AI the moment it tangles your architecture — as a Claude Code plugin.** When an edit introduces a new cross-subsystem coupling or cycle, vibe-graph flags it *in the agent's own context*, right when it happens — plus blast-radius preflight *before* edits. Evidence-based, local-first, no account.

## Install

```text
/plugin marketplace add Naitellos/vibe-graph
/plugin install vibe-graph
```

Then, in your project, **run `/vibe-graph-setup` before editing** — one time, it installs the CLI locally, scans, and sets the drift baseline.

## What you get (the loop)

- **MCP tools** for the agent: `prepare_task` (blast radius + context *before* a change), `validate_diff` (new architectural risks *after*), `get_project_overview`, `get_subsystem`, …
- **An after-edit conformance hook** — every `Edit`/`Write` runs `validate-diff` (non-blocking), so a *new cross-subsystem coupling* or cycle surfaces in the agent's context the moment it's introduced ("you just connected `billing → analytics`"). Type-only imports never false-trip it.
- **`/vibe-graph-onboard`** — LLM-curated subsystem map for richer structure.

## 30-second flow

1. `/plugin marketplace add Naitellos/vibe-graph` → `/plugin install vibe-graph`
2. `/vibe-graph-setup` — installs the CLI, scans, baselines.
3. Ask the agent to plan a change → it calls `prepare_task` / `get_project_overview` and sees the real structure + blast radius.
4. The agent edits → the advisory hook runs `validate-diff` and flags any newly-introduced risk.

## Prerequisites

- **Node ≥ 22.12** in the environment Claude Code runs commands in.
- `/vibe-graph-setup` installs `@codearch/cli` as a local `devDependency` so `npx @codearch/cli` resolves fast (pinned per project). Cold-start alternative: `npm i -g @codearch/cli`.

## Bundled in this plugin

- `.mcp.json` — the `vibe-graph` MCP server (`npx @codearch/cli mcp`)
- `hooks/hooks.json` — advisory `validate_diff` PostToolUse hook
- `commands/vibe-graph-setup.md` — one-time setup
- `commands/vibe-graph-onboard.md` + `skills/` — LLM-driven subsystem onboarding

## Neutral by design

This plugin is the Claude Code distribution channel; the same standalone `@codearch/cli` npm package powers Cursor / Windsurf / CI / a bare terminal (`npx @codearch/cli`) — local-first, MCP-agnostic.
