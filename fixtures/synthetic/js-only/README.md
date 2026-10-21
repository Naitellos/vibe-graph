# js-only

This fixture validates that the scanner handles vanilla JavaScript projects that have no `tsconfig.json`. It contains two `.js` ESM files: `src/main.js` exports a constant, and `src/consumer.js` imports it.

When no `tsconfig.json` is present, the program manager creates a synthetic TypeScript program with `allowJs: true` and `moduleResolution: NodeNext`, allowing the scanner to process `.js` files and resolve module specifiers correctly.

**Observed behavior:** The scanner successfully discovers and analyzes `.js` files without `tsconfig.json`, emitting the expected `imports` edge from `file:src/consumer.js` to `file:src/main.js`.
