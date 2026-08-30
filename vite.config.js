import react from '@vitejs/plugin-react'
import { defineConfig } from 'vite'

// https://vite.dev/config/
export default defineConfig({
  plugins: [react()],
  base: '/calculus_visualizer_simulator_lab/',
  // GitHub Pages serves from /docs on the main branch
  build: {
    outDir: 'docs',
    emptyOutDir: true,
  },
})
