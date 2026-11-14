import react, { reactCompilerPreset } from '@vitejs/plugin-react'
import babel from '@rolldown/plugin-babel'
import { defineConfig } from 'vite'

// https://vite.dev/config/
export default defineConfig({
  envPrefix: ['VITE_', 'DEFAULT_BRIDGE_URL', 'TARGET_SAMPLE_RATE'],
  plugins: [
    react(),
    babel({ presets: [reactCompilerPreset()] })
  ],
})
