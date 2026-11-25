import { defineConfig } from 'vitest/config';

export default defineConfig({
  define: { __APP_VERSION__: '"test"', __BUILD_DATE__: '"2026-01-01"' },
  test: {
    environment: 'node',
    include: ['src/**/*.test.ts'],
    setupFiles: ['fake-indexeddb/auto'],
  },
});
