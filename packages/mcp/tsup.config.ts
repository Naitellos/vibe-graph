import { defineConfig } from 'tsup'

export default defineConfig({
  entry: ['src/index.ts', 'src/bin.ts'],
  format: ['esm'],
  dts: true,
  sourcemap: true,
  clean: true,
  target: 'node22',
  splitting: false,
  // The product uses the SDK's stdio server only. Bundle that path so npm
  // consumers do not install the SDK's unrelated HTTP/Hono dependency tree.
  noExternal: [/^@modelcontextprotocol\/sdk/],
})
