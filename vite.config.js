import { defineConfig } from 'vite'
import react from '@vitejs/plugin-react'

export default defineConfig(({ command }) => ({
  // The build is deployed as a GitHub Pages project site at dnl-strnl.github.io/trinity/.
  base: command === 'build' ? '/trinity/' : '/',
  plugins: [react()],
  server: {
    host: true,
    port: 3333,
    strictPort: true, // fail loudly instead of silently hopping to another port
    proxy: {
      '/api': {
        target: 'http://localhost:33333',
        changeOrigin: true,
      },
      '/images': { // card art: backend serves it from the HF dataset cache
        target: 'http://localhost:33333',
        changeOrigin: true,
      }
    }
  }
}))
