import { cloudflare } from '@cloudflare/vite-plugin'
import { reactRouter } from '@react-router/dev/vite'
import tailwindcss from '@tailwindcss/vite'
import type { Plugin } from 'vite'
import { defineConfig } from 'vite'

function noStoreDevResponses(): Plugin {
  return {
    name: 'no-store-dev-responses',
    apply: 'serve',
    configureServer(server) {
      server.middlewares.use((req, res, next) => {
        const requestUrl = req.url ?? '/'
        const accept = req.headers.accept ?? ''
        const fetchDest = req.headers['sec-fetch-dest']
        const isHtml = accept.includes('text/html') || fetchDest === 'document'
        const isViteRuntimeOrDep =
          requestUrl.startsWith('/@vite/') ||
          requestUrl.startsWith('/@id/') ||
          requestUrl.startsWith('/@fs/') ||
          requestUrl.startsWith('/@react-refresh') ||
          requestUrl.includes('/node_modules/.vite/deps/')

        if (isHtml || isViteRuntimeOrDep) {
          res.setHeader('Cache-Control', 'no-store, max-age=0, must-revalidate')
          res.setHeader('Pragma', 'no-cache')
          res.setHeader('Expires', '0')
        }

        next()
      })
    },
  }
}

export default defineConfig({
  resolve: {
    tsconfigPaths: true,
  },
  plugins: [noStoreDevResponses(), cloudflare({ viteEnvironment: { name: 'ssr' } }), tailwindcss(), reactRouter()],
  server: {
    port: 7529,
    strictPort: true,
    host: true,
  },
  preview: {
    port: 7529,
    strictPort: true,
    host: true,
  },
})
