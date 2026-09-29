import { cloudflareTest } from '@cloudflare/vitest-plugin'
import { defineConfig } from 'vitest/config'

export default defineConfig({
  plugins: [
    cloudflareTest({
      wrangler: { configPath: '../../apps/play/wrangler.jsonc' },
    }),
  ],
  test: {
    include: ['test/**/*.integration.test.ts'],
  },
})
