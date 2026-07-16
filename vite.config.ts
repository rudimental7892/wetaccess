import { randomUUID } from 'node:crypto'
import { defineConfig, type ProxyOptions } from 'vite'
import react from '@vitejs/plugin-react'
import { createDurationMiddleware } from './server/wet3Duration'

/**
 * wet3.click serves a Turnstile "Security Check" HTML shell for anonymous
 * /user/{username} requests. That shell has no `mediaJson`, so wetaccess
 * showed 0 posts. A simple guest `wet3_user_id` cookie is enough to receive
 * the real SSR catalog (verified against live wet3).
 */
const WET3_GUEST_COOKIE = `wet3_user_id=${randomUUID()}`

function createWet3Proxy(): ProxyOptions {
  return {
    target: 'https://wet3.click',
    changeOrigin: true,
    rewrite: (path: string) => path.replace(/^\/wet3-api/, ''),
    configure: (proxy) => {
      proxy.on('proxyReq', (proxyReq) => {
        const existing = proxyReq.getHeader('cookie')
        const merged = existing
          ? `${existing}; ${WET3_GUEST_COOKIE}`
          : WET3_GUEST_COOKIE
        proxyReq.setHeader('cookie', merged)
      })
    },
  }
}

const wet3Proxy = {
  '/wet3-api': createWet3Proxy(),
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
