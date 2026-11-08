import { fileURLToPath } from 'node:url'
import tailwindcss from '@tailwindcss/vite'
import react from '@vitejs/plugin-react'
import { defineConfig, loadEnv } from 'vite'

// https://vite.dev/config/
export default defineConfig(({ mode }) => {
  const env = loadEnv(mode, process.cwd(), '')
  const apiTarget = env.VITE_API_BASE_URL

  return {
    plugins: [react(), tailwindcss()],
    resolve: {
      alias: { '@': fileURLToPath(new URL('./src', import.meta.url)) },
    },
    server: {
      // Chuyển /api sang backend để khỏi phải cấu hình CORS khi dev.
      // Bỏ header Origin: lệnh điều khiển node (ngưỡng, thử còi) của backend từ chối Origin
      // khác địa chỉ backend, mà Origin của dev server là http://localhost:5173.
      proxy: apiTarget
        ? {
            '/api': {
              target: apiTarget,
              changeOrigin: true,
              configure: (proxy) => {
                proxy.on('proxyReq', (proxyReq) => proxyReq.removeHeader('origin'))
              },
            },
          }
        : undefined,
    },
  }
})
