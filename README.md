# vibe-graph

**Zero-config architecture lint for AI edits.**

Your agent just wired two modules that were never connected. `dependency-cruiser` would
catch it — if you'd written the ruleset. Sonar would catch it — if you had an account.
vibe-graph derives the structure from your AST, records it as a baseline, and reports only
what **changed**: a new link between previously independent areas, a new cycle, a boundary
violation. Nothing to write, nothing to maintain, nothing leaves your machine.

TS/JS · one command in Claude Code · MIT · no account, no cloud, no telemetry.

> Status: **alpha.** Works today as a Claude Code plugin and a standalone CLI/MCP server.
> Read [Known issues](#known-issues) before you judge it.

> _Team edition — shared baseline + PR check, $19/dev/mo — [join the waitlist](https://github.com/Naitellos/vibe-graph/discussions)._
> Nothing is built yet; the waitlist is how I decide whether to build it.

---

## The problem

AI coding agents are fast and confident, and they don't hold a model of _your_ architecture.
Across a session they drift: a billing module starts importing analytics, two subsystems
quietly fuse into a cycle, a "small" change fans out across thirty files. Prose rules
(`CLAUDE.md`, `.cursorrules`) decay — compliance falls off a cliff by the tenth message.
By the time you notice, it's a refactor.

Existing tools make you choose: write and maintain a ruleset up front (`dependency-cruiser`,
`eslint-plugin-boundaries`, ArchUnit), or hand your code to a hosted analyzer. vibe-graph
does neither. **Your current structure _is_ the ruleset**, captured once as a baseline, and
you only hear about departures from it.

## The loop

```
  scan + baseline   →   (agent edits)   →   validate_diff   →   surfaced in context
  your structure,       the change          new risk vs          "you just connected
  captured once                             baseline              billing → analytics"
```

After every `Edit`/`Write`, an advisory hook runs `validate_diff` and, when the change
introduces something new, drops one line into the agent's context:

```
vibe-graph: This change introduced 1 new cross-subsystem link (billing → analytics).
```

It's non-blocking by default (the agent sees it and self-corrects), diffed against a
baseline so it only flags what's _new_, and type-only imports (`import type`) never
false-trip it.

## See it in 15 seconds

[`examples/conformance-demo`](examples/conformance-demo) is a tiny project with three
independent areas. One script simulates an AI edit that makes `billing` reach into
`analytics`, and catches it:

```bash
cd examples/conformance-demo && ./run.sh
```

```
This change introduced 1 new cross-subsystem link (billing → analytics).

NEW FINDINGS (1):
  ⚠ New coupling: billing → analytics (areas were independent) (low)

Status: WARN
```

In the plugin, that same check runs as an after-edit hook — the line lands in the agent's
context the moment the import is written.

## Quick start

### As a Claude Code plugin (recommended)

```text
/plugin marketplace add Naitellos/vibe-graph
/plugin install vibe-graph
```

Then, in your project, run setup once before editing:

```text
/vibe-graph-setup
```

That installs the CLI locally, scans the codebase, and records the drift baseline. From
then on the agent gets `prepare_task` / `validate_diff` as MCP tools and the after-edit
conformance hook fires automatically.

### As a standalone CLI (any editor, CI, or a bare terminal)

```bash
# set up in a project
npx @codearch/cli init
npx @codearch/cli scan
npx @codearch/cli baseline

# the differential check — new risks vs baseline
npx @codearch/cli validate-diff
```

### Making it fail a build

Out of the box every signal is **advisory**: `validate-diff` and `check` both exit `0`
even on a new cycle or a new cross-subsystem link. That is deliberate for the edit loop,
but it means zero-config alone will never fail CI.

To get a non-zero exit you must declare the boundary you care about, in
`.vibegraph/config.yml`:

```yaml
rules:
  - kind: edge-pattern
    id: billing-must-not-use-analytics
    severity: high
    mode: enforce          # `advisory` (default) reports; `enforce` exits 1
    from: { subsystem: billing }
    to: { subsystem: analytics }
    relation: imports
    forbidden: true
```

```bash
npx @codearch/cli check     # exits 1 once that edge exists
```

This is the honest trade-off: **the zero-config path gives you signal, not enforcement.**
Turning a signal into a gate currently means naming the rule. Making detected cycles and
boundary regressions gate a build without a hand-written rule is the top open item.

> Flags belong **after** the subcommand (`scan --root=…`, not `--root=… scan`). Passing a
> root-level `--root` before a subcommand is now a hard error rather than a silent
> fallback to the wrong directory.

The same `@codearch/cli` package powers the MCP server (`npx @codearch/cli mcp`) for
Cursor / Windsurf / any MCP client — see [packages/cli/README.md](packages/cli/README.md)
for copy-paste wiring.

## What each surface actually gets

| Surface | Structure + blast radius | Differential check | Automatic, in the edit loop |
|---|---|---|---|
| Claude Code plugin | ✅ MCP tools | ✅ `validate_diff` | ✅ `PostToolUse` hook |
| Cursor / Windsurf / any MCP client | ✅ MCP tools | ✅ `validate_diff` | ❌ agent must call it |
| CI / terminal / any agent | ✅ CLI | ✅ `validate-diff` | ⚠️ only with a declared `mode: enforce` rule |

The hook is Claude-Code-specific. Everywhere else the signal is available but nothing
enforces it: an agent has to choose to call `validate_diff`, and no command exits non-zero
until you declare a rule. Closing that gap — a build-failing exit code for detected cycles
and boundary regressions, with no rule to write — is the single most valuable open item,
because agents reliably act on a failing command and reliably ignore advice.

## Also included

Useful, but not the reason to install this — several excellent free tools do these well:

- **MCP tools for the agent** — `get_project_overview`, `get_subsystem`, `get_blast_radius`,
  `get_context_pack`, and `prepare_task` (blast radius + context _before_ a change).
- **A visual cockpit** — `vibe-graph cockpit` opens a local Map / Detail view of the real
  structure.
- **LLM onboarding** — `/vibe-graph-onboard` curates a richer semantic subsystem map;
  auto-detection gives an honest first-run with zero config.

## Why it's different

- **Nothing to write.** Your existing structure is the baseline. No ruleset, no diagram,
  no YAML required to get the first finding.
- **Differential, not descriptive.** Other tools tell you your coupling. This one tells you
  what _this change_ added. That is the difference between a report and a signal.
- **Local-first, no account.** Everything runs on your machine — enforced by a test that
  fails the build if any package gains a network dependency. No cloud, no sign-up.
- **Evidence-based, deterministic-first.** Edges come from the TypeScript compiler API and
  point at real `file:line`. Not an LLM guessing at your architecture.

## Known issues

Alpha, and these are the ones a new user is most likely to hit:

- **TypeScript project references.** A solution-style `tsconfig.json` (`{"files": [],
  "references": [...]}`) is not resolved correctly yet — the import graph collapses and the
  overview will confidently report near-empty subsystems as "top risks". Point `--root` at
  an individual package as a workaround. Fix tracked; this one produces a *wrong* answer
  rather than an error, so treat monorepo output with suspicion until it lands.
- **Barrel re-exports.** Imports that pass through a package barrel (`src/index.ts`) are
  attributed to the barrel, not the underlying module. This produces `drift:stale` findings
  on declarations that are actually correct — do not act on them blindly.
- **`drift:*` findings are experimental.** Measured precision on our own repo is roughly
  4/9. Trust `new cycle`, `boundary violation` and `new coupling`; treat drift as a hint.
- **No in-loop dismissal yet.** A finding can only be accepted from the cockpit, so a false
  alarm re-fires until you commit. `accept` as a CLI/MCP command is the next thing being built.
- **Nothing fails a build at zero config.** Verified: a project with a genuine
  `alpha ↔ beta` cycle reports it in the graph, yet `check`, `check --strict-rules` and
  `check --enforce` all exit `0`. `check` only gates on *rule* findings, and
  `--strict-rules` escalates just *inert* rules (ones naming a subsystem absent from the
  graph) — not advisory ones. Declare a rule with `mode: enforce` to get a gate.

Found something else? [Open an issue](https://github.com/Naitellos/vibe-graph/issues) —
bug reports from a real repo are the most useful thing you can send right now.

## Requirements

- **Node ≥ 22.12** in the environment your editor runs commands in.
- A TypeScript / JavaScript project (a `package.json` in the root).

## Docs

- [Conformance demo](examples/conformance-demo) — the 15-second version
- [CLI reference & IDE wiring](packages/cli/README.md)
- [Claude Code plugin](packages/plugin)
- [Contributing](CONTRIBUTING.md)

## License

MIT
