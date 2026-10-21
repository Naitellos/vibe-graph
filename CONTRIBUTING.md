# Contributing to Vibe Graph

## Running tests

All tests run through the root vitest config (`vitest.config.ts`), whose
projects are organized by test type (unit, fixtures, mcp, ui, e2e, ...), not by
package. Each package's `test` script delegates to the root runner with a path
filter, so both forms work:

```bash
pnpm test                          # full suite (builds first)
pnpm --filter @codearch/cli test   # only that package's tests
```

Per-package runs assume `pnpm build` has been run (some tests import built
`dist/`). Extra vitest filename filters appended via `pnpm --filter <pkg> test -- <pattern>`
**broaden** the run (filters OR together, they don't intersect); to run a narrow
subset, invoke vitest from the root instead: `pnpm exec vitest run <pattern>`.
Playwright e2e stays separate: `pnpm --filter @codearch/ui test:e2e`.

## Architecture-aware edit loop (dogfooded)

This repo runs its own `validate_diff` loop: after an agent (Claude Code / Cursor)
edits a file, a PostToolUse hook reports architecture findings for the change.

### One-time setup

```bash
pnpm install
pnpm vg:setup   # build the CLI, scan, write the baseline (.vibegraph/cache/baseline.json)
```

`vg:setup` must run before the hook is useful — it builds `dist/` and writes the
baseline the hook validates against. The baseline is a local cache and is not
committed.

### Enabling the hook

Add this to your `.claude/settings.json` (create the file if it isn't there
yet; the file is not part of this repository):

```json
{
  "hooks": {
    "PostToolUse": [
      {
        "matcher": "Edit|Write",
        "hooks": [
          {
            "type": "command",
            "command": "node packages/cli/dist/bin.js validate-diff --json --hook",
            "timeout": 5
          }
        ]
      }
    ]
  }
}
```

### How the hook behaves

- Configured in `.claude/settings.json` (PostToolUse, matcher `Edit|Write`).
- Command: `node packages/cli/dist/bin.js validate-diff --json --hook`.
- `--hook` mode is **advisory and never blocks** your edit. Before `vg:setup`
  (no `dist/` or no baseline) it degrades gracefully — your Edit/Write still
  completes.

### Disabling the hook

Set `VIBEGRAPH_HOOK=0` in the environment to no-op the hook (e.g. for a session
where you don't want the feedback). No need to edit your settings file.

## How this repository is published

Vibe Graph is developed in a private repository, and this repository is
published from it at each release. History here is one snapshot commit per
release, not the day-to-day commit log.

Issues and pull requests are welcome. A pull request is not merged in place:
when it is accepted, the change is applied upstream (with you as the commit
author) and shows up here in the next release. The pull request is then closed
with a note saying so; that is how accepted changes look here, it doesn't mean
the change was rejected.
