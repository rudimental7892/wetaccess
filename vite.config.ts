import { randomUUID } from 'node:crypto'
import { defineConfig, type ProxyOptions } from 'vite'
import react from '@vitejs/plugin-react'
import { createAcProxyMiddleware } from './server/acProxy'
import { createFbProxyMiddleware } from './server/fbProxy'
import { createDropsMiddleware } from './server/dropsApi'
import { createDurationMiddleware } from './server/wet3Duration'
import { createHlsProxyMiddleware } from './server/hlsProxy'
import { createStreamRedirectMiddleware } from './server/streamProxy'
import { rewriteStreamLocation } from './server/hlsProxyCore'

/**
 * wet3.click serves a Turnstile "Security Check" HTML shell for anonymous
 * /user/{username} requests. That shell has no `mediaJson`, so wetaccess
 * showed 0 posts. A simple guest `wet3_user_id` cookie is enough to receive
 * the real SSR catalog (verified against live wet3).
 */
const WET3_GUEST_COOKIE = `wet3_user_id=${randomUUID()}`
const WET3_ORIGIN = 'https://wet3.click'

function createWet3Proxy(): ProxyOptions {
  return {
    target: WET3_ORIGIN,
    changeOrigin: true,
    rewrite: (path: string) => path.replace(/^\/wet3-api/, ''),
    configure: (proxy) => {
      proxy.on('proxyReq', (proxyReq) => {
        const existing = proxyReq.getHeader('cookie')
        const merged = existing
          ? `${existing}; ${WET3_GUEST_COOKIE}`
          : WET3_GUEST_COOKIE
        proxyReq.setHeader('cookie', merged)
        // wet3 403s stream-v2 when Referer is localhost/wetaccess; Bunny needs wet3 too.
        proxyReq.setHeader('referer', `${WET3_ORIGIN}/`)
        proxyReq.setHeader('origin', WET3_ORIGIN)
      })
      proxy.on('proxyRes', (proxyRes) => {
        const location = proxyRes.headers.location
        if (typeof location === 'string') {
          proxyRes.headers.location = rewriteStreamLocation(location)
        }
      })
    },
  }
}

const wet3Proxy = {
  '/wet3-api': createWet3Proxy(),
}

function attachLocalApis() {
  return {
    name: 'wet3-local-apis',
    configureServer(server: { middlewares: { use: (fn: unknown) => void } }) {
      server.middlewares.use(createAcProxyMiddleware())
      server.middlewares.use(createFbProxyMiddleware())
      server.middlewares.use(createDropsMiddleware())
      server.middlewares.use(createStreamRedirectMiddleware())
      server.middlewares.use(createDurationMiddleware())
      server.middlewares.use(createHlsProxyMiddleware())
    },
    configurePreviewServer(server: { middlewares: { use: (fn: unknown) => void } }) {
      server.middlewares.use(createAcProxyMiddleware())
      server.middlewares.use(createFbProxyMiddleware())
      server.middlewares.use(createDropsMiddleware())
      server.middlewares.use(createStreamRedirectMiddleware())
      server.middlewares.use(createDurationMiddleware())
      server.middlewares.use(createHlsProxyMiddleware())
    },
  }
}

// https://vite.dev/config/
export default defineConfig({
  plugins: [react(), attachLocalApis()],
  server: {
    proxy: wet3Proxy,
  },
  preview: {
    proxy: wet3Proxy,
  },
})
