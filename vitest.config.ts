import { fileURLToPath } from 'node:url'
import { defineConfig } from 'vitest/config'

// Two projects: `unit` (pure functions, no database) and `db` (domain functions against a real
// Postgres: the test database is dropped, created and migrated by tests/db/global-setup.ts).
export default defineConfig({
  resolve: {
    alias: {
      '#shared': fileURLToPath(new URL('./shared', import.meta.url)),
      '~~': fileURLToPath(new URL('.', import.meta.url)),
    },
  },
  test: {
    projects: [
      {
        extends: true,
        test: {
          name: 'unit',
          include: ['tests/unit/**/*.test.ts'],
          environment: 'node',
        },
      },
      {
        extends: true,
        test: {
          name: 'db',
          include: ['tests/db/**/*.test.ts'],
          environment: 'node',
          globalSetup: ['tests/db/global-setup.ts'],
          fileParallelism: false,
          hookTimeout: 60_000,
          testTimeout: 30_000,
        },
      },
    ],
  },
})
