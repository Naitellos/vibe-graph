# /vibe-graph-onboard

Generate or refine `.vibegraph/subsystems/*.yml` from the current codebase. Reads AST snapshot + representative files, then writes curated semantic YAML docs for each subsystem.

## Usage

- `/vibe-graph-onboard` — full project onboard (generates all subsystems from scratch)
- `/vibe-graph-onboard --subsystem <slug> --refine` — re-curate one existing subsystem

## What you must do

### 1. Sanity check (before doing anything)

- Run `vibe-graph scan` if `.vibegraph/cache/graph.json` is missing or older than 24h.
- If no `package.json` in cwd, abort with: "Not a Node/TS project — onboarder requires TS/JS codebase."
- If `.vibegraph/subsystems/` already has `.yml` files AND `--refine` flag NOT passed, abort: "Already onboarded. Use `--subsystem <slug> --refine` to update one, or delete `.vibegraph/subsystems/` to start fresh."

### 2. Read deterministic context

Read in this order (use Read and Bash tools):
- `README.md` (top of repo, first 200 lines)
- `package.json` (deps, scripts, workspaces field)
- Top-level directory tree (depth 2)
- `.vibegraph/cache/graph.json` (parse to get file inventory + import edges + fan-in/fan-out)

### 3. Identify subsystem candidates (5–12 typical)

Heuristics:
- Top-level dirs are seed candidates: `server/`, `client/`, `packages/*`, `src/*`
- Nodes with high fan-in inside one of those dirs = subsystem nucleus
- Reject candidates with fewer than 3 files
- If `docs/architecture/` or similar exists, read for prior conventions

### 4. For each candidate subsystem

Parallelise file reads where possible:
- Pick the 5–10 representative files (highest fan-in within the candidate)
- Read them (look for: exports, route handlers, schema mentions, dep references)
- Identify schema_tables: grep for Drizzle `table()` / Prisma `model` declarations OR look for migration files
- Synthesize the SubsystemDoc YAML matching this exact schema:

```yaml
id: <slug>                     # required, must match filename
title: <Human Title>           # required
layer: domain | horizontal | infra | external | shared   # required — STRICTLY one of these
status: shipped | in-progress | direction | pointer-only | unknown
description: |
  <3–5 markdown sentences citing key files>
last_verified: <YYYY-MM-DD today>
verified_by: claude-sonnet-4-7
match:
  - <glob>
  - <glob>
depends_on: [<slugs of subsystems this imports from>]
consumed_by: [<slugs of subsystems that import from this>]
schema_tables: [<table names from grep>]
related_specs: []
related_decisions: []
memory_refs: []
```

⚠️ **Field and value rules (must follow exactly):**
- **Only** the fields listed in the schema above are valid. Do NOT add extra fields like `configKeys`, `features`, or `externalDependencies` — they are not in the schema and will be silently ignored.
- **Field names are snake_case.** Use `depends_on`, NOT `dependsOn`. Use `consumed_by`, NOT `consumedBy`.
- **`layer` value must be exactly one of:** `domain`, `horizontal`, `infra`, `external`, `shared`. Do NOT use `application`, `service`, `unknown`, or any other value.
- **`status` value must be exactly one of:** `shipped`, `in-progress`, `direction`, `pointer-only`, `unknown`.

Use snapshot edges to inform `depends_on` and `consumed_by`: any edge from this candidate's files crossing into another candidate's files is a dep.

Layer heuristic: `server/api` or `server/routes` → `domain`. `client/ui` or shared components → `horizontal`. `infra/` or `migrations/` → `infra`.

### 5. Write the YAMLs

Use the Write tool to create each `.vibegraph/subsystems/<slug>.yml`. Validate filename matches `id` field.

### 6. After all written

- Run `vibe-graph scan` again so the cockpit picks up drift findings.
- Print summary: "Wrote N subsystems. Open cockpit: `vibe-graph` (or `npx vibe-graph`)."

## Constraints (do NOT)

- Do NOT modify `.vibegraph/config.yml` (project settings — user owned).
- Do NOT overwrite an existing `.vibegraph/subsystems/<slug>.yml` unless `--refine --subsystem <slug>` is passed.
- Do NOT exceed reasonable token budget: for projects > 1000 files, read only 3–5 files per candidate (not 10).
- Do NOT call external APIs directly — use only native Claude Code tools (Read, Write, Bash, Grep).
- Do NOT write files outside `.vibegraph/subsystems/`.

## Refine mode (`--subsystem payments --refine`)

- Read existing `.vibegraph/subsystems/payments.yml`
- Run a fresh `vibe-graph scan`
- Read all files currently in `match` globs
- Diff against current YAML: new files in tracks? deps changed?
- Re-synthesize the YAML with updated `last_verified` (today) + updated `depends_on`/`consumed_by`/`description`
- Overwrite `.vibegraph/subsystems/payments.yml`
