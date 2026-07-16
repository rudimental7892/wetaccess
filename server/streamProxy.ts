import type { Connect } from 'vite'
import { randomUUID } from 'node:crypto'
import { rewriteStreamLocation, wet3FetchHeaders } from './hlsProxyCore'

const WET3_ORIGIN = 'https://wet3.click'

/**
 * Intercept stream-v2 so Bunny/CDN redirects are rewritten to /api/hls-proxy.
 * Vite's http-proxy does not reliably let us rewrite Location for this case.
 */
export function createStreamRedirectMiddleware(): Connect.NextHandleFunction {
  return (req, res, next) => {
    const match = req.url?.match(/^\/wet3-api\/api\/stream-v2\/([^/?#]+)/)

    if (!match) {
      next()
      return
    }

    const method = (req.method ?? 'GET').toUpperCase()
    if (method !== 'GET' && method !== 'HEAD') {
      next()
      return
    }

    const mediaId = decodeURIComponent(match[1])
    const targetUrl = `${WET3_ORIGIN}/api/stream-v2/${encodeURIComponent(mediaId)}`

    void fetch(targetUrl, {
      method: 'GET',
      redirect: 'manual',
      headers: wet3FetchHeaders({
        Cookie: `wet3_user_id=${randomUUID()}`,
      }),
    })
      .then(async (upstream) => {
        const location = upstream.headers.get('location')

        if (location) {
          res.statusCode = 302
          res.setHeader('Location', rewriteStreamLocation(location))
          res.setHeader('Cache-Control', 'private, no-store')
          res.end()
          return
        }

        res.statusCode = upstream.status
        const contentType = upstream.headers.get('content-type')
        if (contentType) {
          res.setHeader('Content-Type', contentType)
        }
        res.setHeader('Cache-Control', 'private, no-store')
        res.end(Buffer.from(await upstream.arrayBuffer()))
      })
      .catch((error: unknown) => {
        res.statusCode = 502
        res.setHeader('Content-Type', 'application/json')
        res.end(
          JSON.stringify({
            error: 'stream proxy failed',
            detail: error instanceof Error ? error.message : String(error),
          }),
        )
      })
  }
}
