import { defineConfig } from 'tsup'

export default defineConfig({
  entry: ['src/index.ts'],
  format: ['esm'],
  dts: true,
  sourcemap: true,
  clean: true,
  target: 'node22',
  splitting: false,
  // CJS-only packages (picomatch, ignore, typescript) are imported
  // via `import X = require('pkg')` in TypeScript source. tsup/esbuild emits
  // a __require shim that relies on the CJS `require` global — which doesn't
  // exist in ESM Node. Adding a banner that creates a module-local `require`
  // via createRequire(import.meta.url) makes the __require shim work at runtime.
  banner: {
    js: `import { createRequire } from 'node:module';\nconst require = createRequire(import.meta.url);`,
  },
})
