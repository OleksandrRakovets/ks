import { defineConfig } from 'vitest/config'

export default defineConfig({
  test: {
    include: ['test/**/*.e2e.test.ts'],
    globalSetup: ['./test/server.ts'],
    // One Worker and one browser at a time fit small orbs. Tests use distinct matches;
    // their D1/DO state is disposable, but not transactionally reset between cases.
    fileParallelism: false,
    maxWorkers: 1,
    testTimeout: 30_000,
    hookTimeout: 60_000,
  },
})
