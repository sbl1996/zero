import { defineConfig, loadEnv } from 'vite'
import vue from '@vitejs/plugin-vue'
import path from 'node:path'

export default defineConfig(({ mode }) => {
  const env = loadEnv(mode, process.cwd(), '')
  return {
    plugins: [vue()],
    resolve: {
      alias: {
        '@': path.resolve(__dirname, 'src'),
      },
    },
    server: {
      port: Number(env.VITE_PORT || 4173),
      host: true,
      proxy: env.VITE_API_BASE_URL
        ? {
            '/api': {
              target: env.VITE_API_BASE_URL,
              changeOrigin: true,
            },
            '/files': {
              target: env.VITE_API_BASE_URL,
              changeOrigin: true,
            },
          }
        : undefined,
    },
  }
})
