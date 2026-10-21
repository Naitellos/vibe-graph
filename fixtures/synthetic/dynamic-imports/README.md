# dynamic-imports

This fixture asserts that a dynamic `await import('./lazy.js')` in `loader.ts` is resolved and produces an `imports` edge from `file:src/loader.ts` to `file:src/lazy.ts`.

The edge `kind` is still `imports` (same as static imports). The difference is in the evidence coupling field, which is `dynamic` rather than `runtime` — but since `assertions.json` can only check edges and findings (spec §9.2), the assertion is just that the imports edge exists.

**Note:** The underlying evidence row for this edge has `coupling: "dynamic"`, confirming the scanner correctly identifies the call as a dynamic import expression rather than a static import declaration.
