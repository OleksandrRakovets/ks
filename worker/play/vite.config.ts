import { cloudflare } from '@cloudflare/vite-plugin'
import { reactRouter } from '@react-router/dev/vite'
import tailwindcss from '@tailwindcss/vite'
import { defineConfig } from 'vite'

/** Logged by the bypass in src/superadmin-access.ts; its presence in emitted code means the branch survived. */
const superadminBypassMarker = 'Superadmin Access bypassed by the Vite dev server'

export default defineConfig(({ command }) => ({
  define: {
    // The superadmin bypass (src/superadmin-access.ts) exists only in code the dev server compiles;
    // every build, whatever NODE_ENV or mode, replaces this with false and drops the branch.
    'import.meta.env.KS_DEV_SERVER': JSON.stringify(command === 'serve'),
  },
  resolve: {
    dedupe: ['react', 'react-dom'],
    tsconfigPaths: true,
  },
  plugins: [
    cloudflare({
      viteEnvironment: { name: 'ssr' },
    }),
    tailwindcss(),
    reactRouter(),
    {
      // Fails any build, whatever NODE_ENV or mode, whose emitted code kept the dev-server-only bypass.
      name: 'ks:no-superadmin-bypass-in-builds',
      apply: 'build',
      generateBundle(_options, bundle) {
        for (const chunk of Object.values(bundle))
          if (chunk.type === 'chunk' && chunk.code.includes(superadminBypassMarker))
            this.error(`${chunk.fileName} contains the dev-server superadmin bypass`)
      },
    },
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
