import { defineConfig } from 'vitest/config';

export default defineConfig({
  base: './',
  define: {
    // the page and the host program are stamped with the same id when built as a pair (scripts/host.mjs)
    __BUILD_ID__: JSON.stringify(process.env.RESOUND_BUILD ?? 'dev'),
  },
  build: {
    target: 'es2022',
    sourcemap: false,
    chunkSizeWarningLimit: 1200,
  },
  server: {
    port: 5173,
    strictPort: false,
  },
  preview: {
    port: 4173,
    strictPort: false,
  },
  test: {
    environment: 'node',
    include: ['tests/**/*.test.ts'],
    testTimeout: 120_000,
    // every test file runs in a process of its own; a few at a time is kinder to a laptop that is doing other things
    maxWorkers: 4,
  },
});
