import { cloudflare } from '@cloudflare/vite-plugin'
import { reactRouter } from '@react-router/dev/vite'
import tailwindcss from '@tailwindcss/vite'
import { defineConfig } from 'vite'

export default defineConfig({
  resolve: {
    dedupe: ['react', 'react-dom', 'react/compiler-runtime'],
    tsconfigPaths: true,
  },
  plugins: [
    cloudflare({
      viteEnvironment: { name: 'ssr' },
      auxiliaryWorkers: [{ configPath: '../../do/match-room/wrangler.jsonc', devOnly: true }],
    }),
    tailwindcss(),
    reactRouter(),
  ],
  server: {
    port: 7529,
    strictPort: true,
    host: '0.0.0.0',
    allowedHosts: ['.onamp.dev'],
  },
  preview: {
    port: 7529,
    strictPort: true,
    host: '0.0.0.0',
    allowedHosts: ['.onamp.dev'],
  },
})
