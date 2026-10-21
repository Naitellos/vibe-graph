# /vibe-graph-setup

One-time setup that activates the vibe-graph killer loop in this project: installs the CLI locally, scaffolds config, scans, and sets the drift baseline. Run this once after `/plugin install vibe-graph`, before relying on the loop.

## What you must do

### 1. Guards
- If there is no `package.json` in the current working directory, abort with: "Not a Node/TS project — vibe-graph requires a JS/TS codebase."
- Check Node version (`node --version`). If below 22.12, abort with: "vibe-graph requires Node >= 22.12. Upgrade Node (e.g. via nvm) and retry."

### 2. Install the CLI locally (pinned) + pre-warm
- Run `npm install --save-dev @codearch/cli@^0.1` (local, version-pinned in this project's `package.json` — the hook and MCP server resolve it fast via `npx`).
- Pre-warm the npx cache: `npx --yes @codearch/cli --version`.

### 3. Scaffold config — only if absent (idempotent)
- If `.vibegraph/config.yml` does NOT exist: run `npx -y @codearch/cli init`.
- If it exists: skip (do not overwrite — it is user-owned).

### 4. Scan
- Run `npx -y @codearch/cli scan` (builds `.vibegraph/cache/graph.json`; safe to repeat).

### 5. Baseline — only if absent (idempotent)
- If `.vibegraph/cache/baseline.json` does NOT exist: run `npx -y @codearch/cli baseline`.
- If it exists: skip (re-baselining would erase the drift reference). To intentionally reset, the user runs `npx -y @codearch/cli baseline` manually.

### 6. Report
- Print: "Loop is live. I'll preflight changes with prepare_task and validate edits automatically (advisory). For LLM-curated subsystems, run /vibe-graph-onboard. Open the cockpit anytime: npx @codearch/cli."

## Constraints (do NOT)
- Do NOT overwrite an existing `.vibegraph/config.yml` or `.vibegraph/cache/baseline.json`.
- Do NOT run a global install or publish.
- Do NOT call external APIs — use only Bash/Read tools to run the commands above.
