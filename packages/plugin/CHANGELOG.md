# @codearch/plugin

## 0.1.2

### Patch Changes

- Pin the hook and the MCP server to `@codearch/cli@0.1.4`, which drops `braces`
  from the production dependency tree (`npm audit` on install is clean) and
  bundles MCP SDK 1.32.1.

## 0.1.1

### Patch Changes

- Pin the hook and the MCP server to `@codearch/cli@0.1.3` instead of an unversioned
  `npx -y @codearch/cli`, so installs run the release that keeps the hook silent in
  repositories without `.vibegraph/` rather than whatever npm or the local npx cache
  resolves. `test/invariants/plugin-pins-cli-version.test.ts` fails whenever the CLI
  version changes and the pin does not.

## 0.1.0

### Minor Changes

- 25daaf2: Plan 3 — CLI + IDE polish (MVP Track A). Closes the AI refactor loop's human/CI face:

  - New `vibe-graph check` CLI command runs the rules engine on the current snapshot. Exits 1 on any enforce-mode violation, 0 otherwise. Flags: `--enforce` / `--since-baseline` / `--rule <id>` / `--mode <advisory|warn|enforce>` / `--json`.
  - New `vibe-graph validate-diff` CLI command — standalone face of the MCP `validate_diff` tool. Resolves changed files via `git diff HEAD`, `--against <ref>`, `--diff <file>`, or `--working-files <list>`. Flags: `--enforce` / `--mode` / `--advisory` / `--json`. Exits 1 on verdict='violation'.
  - Delta semantics aligned between CLI and MCP — both now detect worsened findings (severity escalation, status transitions to `open`), not just brand-new ids.
  - `vibe-graph init --hooks` writes an opt-in `.claude/hooks/post-tool-use.json` that calls `vibe-graph validate-diff --json --advisory` non-blocking after Edit and Write tool uses.
  - New `refactor-loop` plugin skill tells Claude Code agents to bracket every Edit/Write with `prepare_task` + `validate_diff`.
  - README "Connect to your IDE" section with copy-paste MCP wiring snippets for Windsurf, Cline, Continue.dev, Zed, Codex, and a generic stdio MCP client.
  - E2E coverage: `cli-check.test.ts` (5 scenarios) + `cli-validate-diff.test.ts` (4 scenarios reusing the Plan 2 rules-cases fixture) + self-hosting smoke that runs `vibe-graph check --json` on this repo.
