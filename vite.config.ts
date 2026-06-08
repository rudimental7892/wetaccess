import { defineConfig } from 'vite'
import react from '@vitejs/plugin-react'
import { createDurationMiddleware } from './server/wet3Duration'

const wet3Proxy = {
  '/wet3-api': {
    target: 'https://wet3.click',
    changeOrigin: true,
    rewrite: (path: string) => path.replace(/^\/wet3-api/, ''),
  },
}

// https://vite.dev/config/
export default defineConfig({
  plugins: [
    react(),
    {
      name: 'wet3-duration-api',
      configureServer(server) {
        server.middlewares.use(createDurationMiddleware())
      },
      configurePreviewServer(server) {
        server.middlewares.use(createDurationMiddleware())
      },
    },
  ],
  server: {
    proxy: wet3Proxy,
  },
  preview: {
    proxy: wet3Proxy,
  },
})
