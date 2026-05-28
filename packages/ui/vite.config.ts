import babel from '@rolldown/plugin-babel'
import react, { reactCompilerPreset } from '@vitejs/plugin-react'
import { defineConfig } from 'vite'

export default defineConfig({
  plugins: [react(), babel({ presets: [reactCompilerPreset()] })],
  build: {
    emptyOutDir: true,
    sourcemap: true,
    lib: {
      entry: './src/index.ts',
      formats: ['es'],
      fileName: () => 'index.js',
    },
    rolldownOptions: {
      external: ['react', 'react-dom', 'react/compiler-runtime', 'react/jsx-dev-runtime', 'react/jsx-runtime'],
    },
  },
})
