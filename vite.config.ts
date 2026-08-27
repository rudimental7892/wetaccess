import { randomUUID } from 'node:crypto'
import { defineConfig, type ProxyOptions } from 'vite'
import tailwindcss from '@tailwindcss/vite'
import react from '@vitejs/plugin-react'
import { createAcProxyMiddleware } from './server/acProxy'
import { createFbProxyMiddleware } from './server/fbProxy'
import { createFtProxyMiddleware } from './server/ftProxy'
import { createLzProxyMiddleware } from './server/lzProxy'
import { createScProxyMiddleware } from './server/scProxy'
import { createDropsMiddleware } from './server/dropsApi'
import { createDurationMiddleware } from './server/wet3Duration'
import { createHlsProxyMiddleware } from './server/hlsProxy'
import { createStreamRedirectMiddleware } from './server/streamProxy'
import { createCreatorsMiddleware } from './server/creatorsApi'
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
        // Extra browser headers to reduce Turnstile challenge (wet3 now 403 without them)
        proxyReq.setHeader(
          'user-agent',
          'Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/131.0.0.0 Safari/537.36',
        )
        proxyReq.setHeader('accept', 'text/html,application/xhtml+xml,application/xml;q=0.9,image/avif,image/webp,*/*;q=0.8')
        proxyReq.setHeader('accept-language', 'en-US,en;q=0.9')
        proxyReq.setHeader('sec-fetch-site', 'same-origin')
        proxyReq.setHeader('sec-fetch-mode', 'navigate')
        proxyReq.setHeader('sec-fetch-dest', 'document')
        proxyReq.setHeader('upgrade-insecure-requests', '1')
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
      server.middlewares.use(createCreatorsMiddleware())
      server.middlewares.use(createAcProxyMiddleware())
      server.middlewares.use(createFbProxyMiddleware())
      server.middlewares.use(createFtProxyMiddleware())
      server.middlewares.use(createLzProxyMiddleware())
      server.middlewares.use(createScProxyMiddleware())
      server.middlewares.use(createDropsMiddleware())
      server.middlewares.use(createStreamRedirectMiddleware())
      server.middlewares.use(createDurationMiddleware())
      server.middlewares.use(createHlsProxyMiddleware())
    },
    configurePreviewServer(server: { middlewares: { use: (fn: unknown) => void } }) {
      server.middlewares.use(createCreatorsMiddleware())
      server.middlewares.use(createAcProxyMiddleware())
      server.middlewares.use(createFbProxyMiddleware())
      server.middlewares.use(createFtProxyMiddleware())
      server.middlewares.use(createLzProxyMiddleware())
      server.middlewares.use(createScProxyMiddleware())
      server.middlewares.use(createDropsMiddleware())
      server.middlewares.use(createStreamRedirectMiddleware())
      server.middlewares.use(createDurationMiddleware())
      server.middlewares.use(createHlsProxyMiddleware())
    },
  }
}

// https://vite.dev/config/
export default defineConfig({
  plugins: [tailwindcss(), react(), attachLocalApis()],
  server: {
    proxy: wet3Proxy,
  },
  preview: {
    proxy: wet3Proxy,
  },
})
