import type { Connect } from 'vite'
import { fetchProxiedMedia, isAllowedHlsUrl } from './hlsProxyCore'

export function createHlsProxyMiddleware(): Connect.NextHandleFunction {
  return (req, res, next) => {
    const url = req.url
    if (!url?.startsWith('/api/hls-proxy')) {
      next()
      return
    }

    const parsed = new URL(url, 'http://localhost')
    const targetUrl = parsed.searchParams.get('url')

    if (!targetUrl || targetUrl.trim() === '' || !isAllowedHlsUrl(targetUrl)) {
      res.statusCode = 400
      res.setHeader('Content-Type', 'application/json')
      res.end(
        JSON.stringify({
          error: 'missing or disallowed url',
          detail: !targetUrl || targetUrl.trim() === '' ? 'hls-proxy url= was empty (open proxied stream had no playUrl)' : `host not allowlisted: ${targetUrl}`,
        }),
      )
      return
    }

    void fetchProxiedMedia(targetUrl)
      .then((upstream) => {
        res.statusCode = upstream.status
        if (upstream.contentType) {
          res.setHeader('Content-Type', upstream.contentType)
        }
        res.setHeader('Cache-Control', 'private, no-store')
        res.setHeader('Access-Control-Allow-Origin', '*')
        res.end(upstream.body)
      })
      .catch((error: unknown) => {
        res.statusCode = 502
        res.setHeader('Content-Type', 'application/json')
        res.end(
          JSON.stringify({
            error: 'hls proxy failed',
            detail: error instanceof Error ? error.message : String(error),
          }),
        )
      })
  }
}
