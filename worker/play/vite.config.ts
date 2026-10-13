import { cloudflare } from '@cloudflare/vite-plugin'
import { reactRouter } from '@react-router/dev/vite'
import tailwindcss from '@tailwindcss/vite'
import { defineConfig } from 'vite'

export default defineConfig(({ isPreview }) => {
  // The E2E runner supplies a temporary persistence root while preview loads this config.
  // Normal dev/preview keep the plugin defaults; tests must never mutate the local store.
  const e2eStatePath = process.env.KS_E2E_STATE_PATH
  const workerOptions: Parameters<typeof cloudflare>[0] = { viteEnvironment: { name: 'ssr' } }

  if (e2eStatePath !== undefined) {
    workerOptions.persistState = { path: e2eStatePath }
    workerOptions.inspectorPort = false
  }

  return {
    resolve: {
      dedupe: ['react', 'react-dom'],
      tsconfigPaths: true,
    },
    plugins: [
      cloudflare(workerOptions),
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
  }
})
