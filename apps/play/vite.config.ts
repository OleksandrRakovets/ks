import { cloudflare } from '@cloudflare/vite-plugin'
import { reactRouter } from '@react-router/dev/vite'
import babel from '@rolldown/plugin-babel'
import tailwindcss from '@tailwindcss/vite'
import { reactCompilerPreset } from '@vitejs/plugin-react'
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
    babel({ presets: [reactCompilerPreset()] }),
  ],
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
