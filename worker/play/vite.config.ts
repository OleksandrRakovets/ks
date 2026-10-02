import { cloudflare } from '@cloudflare/vite-plugin'
import { reactRouter } from '@react-router/dev/vite'
import tailwindcss from '@tailwindcss/vite'
import { defineConfig } from 'vite'

// The E2E runner supplies a temporary persistence root before loading this config. Normal
// dev/preview keeps Vite's default local store; tests must never mutate that store.
const e2eStatePath = process.env.KS_E2E_STATE_PATH

export default defineConfig(({ isPreview }) => ({
  resolve: {
    dedupe: ['react', 'react-dom'],
    tsconfigPaths: true,
  },
  plugins: [
    cloudflare({
      persistState: e2eStatePath === undefined ? true : { path: e2eStatePath },
      inspectorPort: e2eStatePath === undefined ? 9229 : false,
      remoteBindings: e2eStatePath === undefined,
      viteEnvironment: { name: 'ssr' },
    }),
    // Preview serves the built Worker. React Router's serve-mode typegen/config watchers
    // are useful for dev, but are not owned/closed by Vite's preview lifecycle.
    ...(isPreview === true ? [] : [tailwindcss(), reactRouter()]),
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
}))
