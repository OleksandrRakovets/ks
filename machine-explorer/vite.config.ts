import { defineConfig } from 'vite'

export default defineConfig({
  resolve: {
    // Source imports and the inspector must share the preview's XState runtime.
    dedupe: ['xstate'],
  },
  server: {
    host: '0.0.0.0',
    port: 7530,
    strictPort: true,
    fs: {
      allow: ['..'],
    },
  },
})
