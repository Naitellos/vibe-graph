---
name: vibe-graph-refactor-loop
description: Use whenever the user asks Claude to refactor, modify, or extend code in a project with vibe-graph installed (presence of `.vibegraph/`). Call `vibe-graph.prepare_task` BEFORE any Edit/Write for architecture context, rules, and doNotDo constraints. Call `vibe-graph.validate_diff` AFTER editing to verify no new rule violations were introduced.
---

# Vibe Graph Refactor Loop

When the user asks to change code in a project that contains a `.vibegraph/` directory, bracket the work with two MCP calls so the agent gets architecture-aware preflight context and post-edit validation.

## 1. Pre-flight (before any Edit/Write)

Call `vibe-graph.prepare_task({ intent, paths, mode })` where:
- `intent` — one-sentence description of the change (e.g. `"add pagination to the orders list"`)
- `paths` — every production file you currently plan to touch
- `mode` — one of `'refactor' | 'feature' | 'bugfix'`

If the user names a subsystem but not a concrete file, call
`vibe-graph.get_subsystem({ id })` first and choose from the files it returns.
Do not infer subsystem ownership from filenames or directory names alone.

Read the returned fields:
- `rules[]` — architectural rules that apply to the target subsystem(s)
- `doNotDo[]` — plain-English constraints derived from forbidding rules
- `requiredContext.files[]` — files you should read for context
- `risks[]` — open findings or high-blast-radius warnings
- `recommendations[]` — concrete suggestions before editing

If a rule conflicts with the user's intent, surface the conflict to the user before proceeding.

## 2. Implementation (normal Edit/Write)

Edit the files. Respect the `rules[]` and `doNotDo[]` constraints. Read the `requiredContext.files[]` before changing surrounding code.

## 3. Post-flight (after the final edit)

Call `vibe-graph.validate_diff({ taskId, workingFiles })` using the exact `taskId`
returned from `prepare_task` and the complete set of files changed for this task.
Read the verdict:
- `'ok'` → confirm the change is complete
- `'warn'` → mention the warnings in your response (`newViolations` + `newFindings`)
- `'violation'` → either fix the underlying issue, or explicitly explain to the user why this violation is acceptable for human review

Pass `workingFiles: [<changed paths>]` when git is not available (e.g. inside a sandbox). Otherwise the tool defaults to `git diff HEAD`.

Read `scope.outOfScopeFiles` separately. If it is non-empty, either run a new
`prepare_task` covering those files or validate them as a separate task. The
returned `graphDelta` is task-scoped; `scope.omittedGraphDelta` counts unrelated
baseline drift without flooding the response. Use `validate_drift` for the
repository-wide drift report. Never re-baseline merely to silence task output.

## When this skill applies

- Refactoring (extract, rename, move modules across subsystems)
- Feature additions that touch architecture-sensitive areas (new endpoints, new subsystem dependencies)
- Bug fixes that might re-introduce known drift
- Anything that crosses subsystem boundaries

## When this skill does NOT apply

- Single-file fixes with no cross-module impact (formatting, comments, doc edits)
- Projects without `.vibegraph/` (no rules engine — skip both calls)
- Pure test-only changes (no production code touched)
