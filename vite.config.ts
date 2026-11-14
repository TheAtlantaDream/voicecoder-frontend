/// <reference types="vitest/config" />
import react, { reactCompilerPreset } from '@vitejs/plugin-react'
import babel from '@rolldown/plugin-babel'
import { defineConfig } from 'vite'

// The Go bridge serves /ws and /editor/ on the same origin in production.
// In dev, proxy them to a locally running bridge (override with BRIDGE_ORIGIN).
const bridge = process.env.BRIDGE_ORIGIN ?? 'http://localhost:8080'

// https://vite.dev/config/
export default defineConfig({
  envPrefix: ['VITE_', 'DEFAULT_BRIDGE_URL', 'TARGET_SAMPLE_RATE', 'VSCODE_WEB_URL'],
  server: {
    proxy: {
      '/vscode': {
        target: 'http://127.0.0.1:3000',
        ws: true,
      },
    },
  },
  plugins: [
    react(),
    babel({ presets: [reactCompilerPreset()] })
  ],
  server: {
    proxy: {
      '/ws': { target: bridge, ws: true, changeOrigin: true },
      '/editor': { target: bridge, ws: true, changeOrigin: true },
    },
  },
  test: {
    environment: 'jsdom',
    setupFiles: ['./src/test/setup.ts'],
    include: ['src/**/*.test.{ts,tsx}'],
    css: false,
  },
})
