---
name: vibe-graph-onboarding
description: Use when user opens a TS/JS project that does not yet have .vibegraph/subsystems/, or asks "what is this codebase" / "help me understand this project" / "build an architecture map". Also use when user asks about vibe-graph setup or LLM-driven onboarding.
---

# Vibe Graph Onboarding

If the user is exploring a codebase with vibe-graph installed but no `.vibegraph/subsystems/` directory, suggest running `/vibe-graph-onboard` to generate a curated semantic map.

The product pivots away from pure AST auto-detection (which gives technically-correct but semantically-useless subsystems on real-world projects) to LLM-curated YAML docs. The AST stays as evidence + drift validator.

After `/vibe-graph-onboard` runs, the user can:
- Open the cockpit (`vibe-graph` or `npx vibe-graph`) to see the rich subsystem map
- Run `vibe-graph scan` to detect drift (yaml-declared deps vs AST-observed deps)
- Use MCP tools `get_subsystem_doc` and `validate_drift` to feed context to AI agents
