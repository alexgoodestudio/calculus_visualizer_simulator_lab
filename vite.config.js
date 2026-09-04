import react from '@vitejs/plugin-react'
import { defineConfig } from 'vite'

// https://vite.dev/config/
export default defineConfig({
  plugins: [react()],
  base: '/calculus_visualizer_simulator_lab/',
  // The workspace folder contains a colon, which Vite's strict path guard
  // misreads on macOS during local development.
  server: {
    fs: {
      strict: false,
    },
  },
  // GitHub Pages serves from /docs on the main branch
  build: {
    outDir: 'docs',
    emptyOutDir: true,
  },
})
