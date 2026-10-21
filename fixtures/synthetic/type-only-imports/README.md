# type-only-imports

This fixture asserts that Vibe Graph correctly records an `imports` edge for `import type` statements: `consumer.ts` uses `import type { X } from './types.js'`, and the scanner emits a `file:src/consumer.ts -[imports]-> file:src/types.ts` edge with `typeOnlyWeight: 1`. The edge exists in the graph even though the coupling is type-only (erased at runtime), allowing architectural analysis to account for compile-time dependencies.
