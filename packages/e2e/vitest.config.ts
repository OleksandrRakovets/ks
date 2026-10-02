import { defineConfig } from 'vitest/config'
import { BaseSequencer, type TestSpecification } from 'vitest/node'

export default defineConfig(() => ({
  test: {
    include: ['test/**/*.e2e.test.ts'],
    globalSetup: ['./test/server.ts'],
    // One Worker and serial browser cases fit small orbs. Tests use distinct matches;
    // their D1/DO state is disposable, but not transactionally reset between cases.
    fileParallelism: false,
    maxWorkers: 1,
    sequence: { sequencer: FreshnessFirst },
    testTimeout: 30_000,
    hookTimeout: 60_000,
  },
}))

// The first freshness case requires an empty store. Other files create unique matches and
// can share this run's store, but must run afterwards. Do not rely on Vitest's cached-duration
// ordering to keep that bootstrap first; preserve its ordinary ordering for the other files.
class FreshnessFirst extends BaseSequencer {
  override async sort(files: TestSpecification[]) {
    const ordered = await super.sort(files)

    return ordered.sort(
      (left, right) =>
        Number(right.moduleId.endsWith('/live-pages.e2e.test.ts')) -
        Number(left.moduleId.endsWith('/live-pages.e2e.test.ts')),
    )
  }
}
