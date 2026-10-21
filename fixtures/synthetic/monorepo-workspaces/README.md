# monorepo-workspaces

This fixture asserts that Vibe Graph correctly discovers workspace packages from `pnpm-workspace.yaml` and maps each to a subsystem: `@fixture/alpha`, `@fixture/beta`, and `@fixture/gamma` all receive a `subsystem:*` node with a `contains` edge to their respective source file.

It also exercises **cross-package dependency resolution**: `beta` imports `@fixture/alpha`, and the scanner resolves that workspace-package specifier to alpha's *source* (`packages/alpha/src/index.ts`) — via synthesized `paths`, independent of whether `node_modules` is symlinked — so the import collapses into a `subsystem:@fixture/beta → subsystem:@fixture/alpha` `depends_on` edge. Consequently alpha and beta are **connected, not orphans**. `gamma` imports nothing and remains an orphan.

> Before the dist-resolution fix, the workspace import was treated as an external reference (resolution landed on built `dist/*.d.ts`, or on nothing in this bare fixture), so the real `beta → alpha` dependency was lost and all three subsystems looked like isolated orphans.
