# Conformance demo — watch vibe-graph catch an AI tangling your architecture

A tiny TS project with three independent areas — `billing`, `analytics`, `core`.
One script simulates an AI edit that makes `billing` reach into `analytics`, and
runs the conformance check that catches it.

## Run it

```bash
./run.sh
```

Requires **Node ≥ 22.12**. Nothing to install — it uses `npx @codearch/cli`.

## What you'll see

```
▶ 1/3  Scan + baseline the clean project
       baseline recorded — billing, analytics, core are separate.

▶ 2/3  An AI edit (mid-session) makes billing reach into analytics
       billing/charge.ts now imports ../analytics/track.js

▶ 3/3  vibe-graph validate-diff:
----------------------------------------------------------------
This change introduced 1 new cross-subsystem link (billing → analytics).

NEW FINDINGS (1):
  ⚠ New coupling: billing → analytics (areas were independent) (low)

Status: WARN
----------------------------------------------------------------
```

The script restores the clean file afterwards, so you can run it again.

## How this maps to the real loop

In the [Claude Code plugin](../../packages/plugin), you don't run anything by hand:
the same `validate-diff` runs as an **after-edit hook**, so the moment your agent
introduces that `billing → analytics` import, this line lands in the agent's own
context and it self-corrects — no dashboard, no account, all local.

> Note: this standalone demo isn't a git repo, so `run.sh` passes
> `--working-files` to tell `validate-diff` what changed. In a real project (a git
> repo) the hook finds changed files via `git diff` automatically.
