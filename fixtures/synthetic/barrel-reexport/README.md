# barrel-reexport

This fixture asserts that Vibe Graph correctly traces re-export chains: `consumer.ts` imports from `index.ts` (the barrel), and `index.ts` re-exports from `internal.ts`, producing two distinct `imports` edges (`consumer→index` and `index→internal`). It also asserts that no direct `consumer→internal` edge is created (the re-export is not collapsed).
