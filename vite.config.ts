import { defineConfig } from 'vitest/config'
import react from '@vitejs/plugin-react'
import packageJson from './package.json' with { type: 'json' }

// https://vite.dev/config/
export default defineConfig({
  base: './',
  plugins: [react()],
  define: {
    __APP_VERSION__: JSON.stringify(packageJson.version),
    __BUILD_DATE__: JSON.stringify(new Date().toISOString()),
  },
  worker: {
    format: 'es',
  },
  build: {
    target: 'es2022',
    sourcemap: false,
    modulePreload: { polyfill: false },
  },
  test: {
    environment: 'jsdom',
    setupFiles: ['./src/test/setup.ts'],
    coverage: {
      reporter: ['text', 'html'],
    },
  },
})
