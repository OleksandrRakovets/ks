import { cloudflareTest } from '@cloudflare/vitest-plugin'
import { defineConfig } from 'vitest/config'

export default defineConfig({
  plugins: [
    cloudflareTest({
      // Keep Play's bindings without loading its Worker and application import graph.
      main: './src/MatchRoom.ts',
      wrangler: { configPath: '../../worker/play/wrangler.jsonc' },
    }),
  ],
  test: {
    include: ['test/**/*.integration.test.ts'],
  },
})
