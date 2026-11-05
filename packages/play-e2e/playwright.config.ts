import { defineConfig } from '@playwright/test'

/**
 * Each worker serves one disposable Play server (see test/browser.ts), so cases run serially and
 * share that store. WebKit skips native Chromium lifecycle cases.
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
  projects: [
    { name: 'chromium', use: { browserName: 'chromium' } },
    { name: 'webkit', use: { browserName: 'webkit' } },
  ],
})
