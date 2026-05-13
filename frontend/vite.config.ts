import { defineConfig } from 'vite'
import vue from '@vitejs/plugin-vue'
import { fileURLToPath, URL } from 'node:url'

export default defineConfig({
  plugins: [vue()],
  resolve: {
    alias: {
      '@': fileURLToPath(new URL('./src', import.meta.url)),
    },
  },
  server: {
    proxy: {
      // Only /api is proxied — grid/shapes use absolute URLs from VITE_GRID_BASE / VITE_SHAPES_BASE.
      // When those env vars point to /grid or /shapes (offline dev), Vite serves from public/.
      '/api': {
        target: 'http://localhost:8000',
        changeOrigin: true,
      },
    },
  },
  worker: {
    format: 'es',
  },
})
