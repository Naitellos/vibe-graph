# @codearch/core

## 0.1.3

### Patch Changes

- 794bb51: Ship the adoption-ready edit loop: local PostToolUse hook activity logging,
  weekly/session stats with rotated-log support, stricter rule diagnostics, and
  the DomainProfile seam used by the repository's own boundary dogfood. Refresh
  the MCP, WebSocket, and YAML runtime chain to patched versions, and bundle only
  the SDK's stdio surface to shrink the installed dependency tree. Refresh the
  release toolchain to patched Vitest, Vite, tsup, and transitive versions,
  including the brace-expansion denial-of-service advisory.
  Known issue: `braces` GHSA-vfj7-8cjw-p6xm (high, no upstream fix yet) still
  reaches the CLI through `fast-glob` and `micromatch`. The affected glob patterns
  come only from the local project's own configuration.
  Make `validate_diff` task-scoped and compact: unrelated repository drift is
  reported as omitted counts instead of full nodes/edges, the MCP text fallback
  no longer duplicates structured JSON, exact task IDs are preserved, and files
  outside the `prepare_task` plan produce an explicit warning.
- a43aea6: Stop the import graph from silently collapsing on TypeScript repositories
  whose tsconfig describes a build rather than the source tree: `projectReferences`
  are no longer forwarded and the program's root files are the discovered files,
  which restores the graph on 6 of 10 measured open-source repositories (hono: 61 →
  1,008 import edges). A coverage guard warns when the program sees under 90% of
  the discovered files. Adds opt-in feature-level subsystem detection
  (`subsystemDetection.granularity: feature`), stops `no-new-orphans` firing on test
  files, and rejects a misplaced `--root` before the subcommand instead of
  answering about a different project.

## 0.1.0

### Minor Changes

- dde2d9c: Initial public release of Vibe Graph — a graph-based code-architecture cockpit and MCP context provider for TypeScript codebases (scan, cockpit UI, drift detection, LLM-driven onboarding, and an MCP server exposing curated project context to AI agents).

  `vibe-graph mcp` now accepts `--root` as an alias for `--project-root` (spec §5.2), so `npx -y vibe-graph mcp --root <dir>` resolves the project root correctly regardless of the launcher's working directory.

- 1af0ffc: Plan 2 — Rules Engine (MVP Track A). Turns the thin AI refactor loop into a real architectural gate:

  - 4 built-in rules ship out of the box (`builtin:no-new-cycles`, `builtin:no-layer-violation`, `builtin:no-new-orphans`, `builtin:drift-must-not-worsen`) and merge with user-defined rules in `.vibegraph/config.yml` (user wins on `id` collision).
  - New `rules: []` field in `ConfigSchema` accepts edge-pattern, boundary, and builtin kinds via a Zod discriminated union (`RuleSchema`).
  - Stage 4.6 in the scan pipeline runs `evaluateRules` between detectors and snapshot assembly — rule findings carry `domain: 'rule'` plus `metadata.ruleId` and `metadata.mode`.
  - `prepare_task` MCP tool now returns populated `rules` and `doNotDo` arrays for the target subsystem (Plan 1 returned empty placeholders).
  - `validate_diff` MCP tool populates `newViolations`/`removedViolations` from rule findings and gates `status` via per-rule `metadata.mode` (advisory never escalates; warn → `'warn'`; enforce → `'violation'`).
  - Cockpit UI: new "Rule violations" filter chip in `DomainTabs` and a `[ruleId]` badge on rule-finding cards.
  - Self-hosting smoke covers the rules engine on this repo; e2e `cli-mcp-rule-violation` proves an AI agent's domain → horizontal import is caught end-to-end.

- 25daaf2: Plan 3 — CLI + IDE polish (MVP Track A). Closes the AI refactor loop's human/CI face:

  - New `vibe-graph check` CLI command runs the rules engine on the current snapshot. Exits 1 on any enforce-mode violation, 0 otherwise. Flags: `--enforce` / `--since-baseline` / `--rule <id>` / `--mode <advisory|warn|enforce>` / `--json`.
  - New `vibe-graph validate-diff` CLI command — standalone face of the MCP `validate_diff` tool. Resolves changed files via `git diff HEAD`, `--against <ref>`, `--diff <file>`, or `--working-files <list>`. Flags: `--enforce` / `--mode` / `--advisory` / `--json`. Exits 1 on verdict='violation'.
  - Delta semantics aligned between CLI and MCP — both now detect worsened findings (severity escalation, status transitions to `open`), not just brand-new ids.
  - `vibe-graph init --hooks` writes an opt-in `.claude/hooks/post-tool-use.json` that calls `vibe-graph validate-diff --json --advisory` non-blocking after Edit and Write tool uses.
  - New `refactor-loop` plugin skill tells Claude Code agents to bracket every Edit/Write with `prepare_task` + `validate_diff`.
  - README "Connect to your IDE" section with copy-paste MCP wiring snippets for Windsurf, Cline, Continue.dev, Zed, Codex, and a generic stdio MCP client.
  - E2E coverage: `cli-check.test.ts` (5 scenarios) + `cli-validate-diff.test.ts` (4 scenarios reusing the Plan 2 rules-cases fixture) + self-hosting smoke that runs `vibe-graph check --json` on this repo.

- 20485b0: Plan 4: Cockpit Change Mode + Agent Activity Log.

  - **Change Mode** (new top-tab): visual `prepare_task` — form (intent + paths chips + mode) → POST `/api/prepare-task` → 6 result sections (Target, Active Risks, Applicable Rules, Do Not Do, Required Context, Recommendations / Tests) → sticky Copy-as-Markdown / Copy JSON exit bar.
  - **Agent Activity Log** (new top-tab): live timeline of MCP tool calls, persisted to `.vibegraph/cache/agent-activity.ndjson`, bridged via chokidar tailer + WS broadcast. Badge counter on the Activity tab. Redacted args + result with truncation marker.
  - **Core**: `prepareTask()` extracted from the MCP wrapper (alongside rule formatter helpers + new `TaskError`). New `ActivityEntrySchema` + `generateActivityEntryId`.
  - **MCP**: `activity-log` middleware wraps tool dispatch; `McpServerOptions` + `ToolHandlerContext` now require `projectRoot`.
  - **CLI**: new routes `POST /api/prepare-task`, `GET /api/agent-activity`; chokidar tailer owns NDJSON rotation; WS bus extended with `'activity'` event.
  - **UI**: `Workspace` union extended; `CockpitShell` uses controlled-render variants per workspace; `url.ts` syncs the `?workspace=` query param.

  Out of scope (Plan 5+): Flow Map, Activity Log filter UI, project-wide prepare, dedicated Blast Radius before/after/delta view.
