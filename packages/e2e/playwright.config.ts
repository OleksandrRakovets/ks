import { defineConfig } from '@playwright/test'

const emptyStore = '**/empty-list.e2e.ts'

/**
 * Each worker serves one disposable Play preview (see test/browser.ts), so a project's cases run
 * serially and share its store. Empty-store cases get their own project, therefore their own
 * worker and store. WebKit skips native Chromium lifecycle cases.
 */
export default defineConfig({
  testDir: './test',
  testMatch: '**/*.e2e.ts',
  fullyParallel: false,
  workers: 1,
  forbidOnly: true,
  timeout: 30_000,
  reporter: [['list'], ['html', { open: 'never' }]],
  use: { trace: 'retain-on-failure' },
  projects: (['chromium', 'webkit'] as const).flatMap((browserName) => [
    { name: browserName, use: { browserName }, testIgnore: emptyStore },
    { name: `${browserName}-empty-store`, use: { browserName }, testMatch: emptyStore },
  ]),
})
