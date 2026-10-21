/// <reference types="vitest" />
import react from '@vitejs/plugin-react'
import { defineConfig } from 'vite'

export default defineConfig({
  plugins: [react()],
  server: { port: 5173 },
  build: {
    outDir: 'dist',
    emptyOutDir: true,
    sourcemap: true,
    commonjsOptions: {
      // Ensure CJS packages (e.g. dagre) are properly transformed to ESM
      // so that `require()` never leaks into the browser bundle.
      include: [/dagre/, /node_modules/],
      transformMixedEsModules: true,
    },
  },
  optimizeDeps: {
    include: ['dagre'],
  },
  test: {
    environment: 'jsdom',
    setupFiles: ['./test/setup.ts'],
  },
})
