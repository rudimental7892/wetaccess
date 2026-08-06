import type { Connect } from 'vite'
import { randomUUID } from 'node:crypto'
import {
  cloudFrontExpiryUnix,
  fetchProxiedMedia,
  isCloudFrontUrlExpired,
  resolveWet3ProxyNestedUrl,
  rewriteStreamLocation,
  wet3FetchHeaders,
} from './hlsProxyCore'
import { obtainWet3StreamToken, streamV2UrlWithToken } from './wet3StreamToken'

const WET3_ORIGIN = 'https://wet3.click'

type ProxyRes = {
  statusCode: number
  setHeader: (k: string, v: string) => void
  end: (b?: string | Buffer) => void
}

function sendJson(res: ProxyRes, status: number, body: Record<string, unknown>) {
  res.statusCode = status
  res.setHeader('Content-Type', 'application/json')
  res.setHeader('Cache-Control', 'private, no-store')
  res.end(JSON.stringify(body))
}

/**
 * Serve CDN media through our HLS proxy so the browser never requests Bunny/AAF
 * directly (Bunny Referer-gates to wet3.click → 403 from localhost / hls.js).
 */
async function serveProxiedLocation(res: ProxyRes, location: string): Promise<void> {
  const rewritten = rewriteStreamLocation(location)

  if (rewritten.startsWith('/api/hls-proxy')) {
    const nested = new URL(rewritten, 'http://localhost').searchParams.get('url')
    if (nested) {
      const proxied = await fetchProxiedMedia(nested)
      res.statusCode = proxied.status
      if (proxied.contentType) {
        res.setHeader('Content-Type', proxied.contentType)
      }
      res.setHeader('Cache-Control', 'private, no-store')
      res.setHeader('Access-Control-Allow-Origin', '*')
      // Tell clients the stable same-origin play URL (segments already rewritten).
      res.setHeader('X-Wetaccess-Play-Url', rewritten)
      res.end(proxied.body)
      return
    }
  }

  res.statusCode = 302
  res.setHeader('Location', rewritten)
  res.setHeader('Cache-Control', 'private, no-store')
  res.end()
}

async function fetchWet3Stream(targetUrl: string, attempts = 3) {
  let lastError: unknown
  for (let attempt = 0; attempt < attempts; attempt += 1) {
    try {
      return await fetch(targetUrl, {
        method: 'GET',
        redirect: 'manual',
        headers: wet3FetchHeaders({
          Cookie: `wet3_user_id=${randomUUID()}`,
        }),
      })
    } catch (error) {
      lastError = error
      if (attempt < attempts - 1) {
        await new Promise((r) => setTimeout(r, 300 * (attempt + 1)))
      }
    }
  }
  throw lastError instanceof Error ? lastError : new Error(String(lastError))
}

/**
 * Intercept stream-v2 so Bunny/CDN never reaches the browser.
 * Resolves wet3 redirects server-side and returns a rewritten playlist (or a
 * same-origin hls-proxy Location). Vite's http-proxy alone is not reliable here.
 */
export function createStreamRedirectMiddleware(): Connect.NextHandleFunction {
  return (req, res, next) => {
    const url = req.url ?? ''
    // wet3 now uses proxy-m3u8; older builds used proxy / proxy.m3u8.
    const proxyMatch = url.match(/^\/wet3-api\/api\/stream-v2\/proxy(?:-m3u8|\.m3u8)?(?:\?|$)/)
    if (proxyMatch) {
      void (async () => {
        try {
          const parsed = new URL(url, 'http://localhost')
          const nested = parsed.searchParams.get('url')
          if (!nested) {
            sendJson(res, 400, {
              error: 'missing target URL',
              detail: 'wet3 proxy-m3u8 redirect had no url= parameter',
            })
            return
          }

          if (isCloudFrontUrlExpired(nested)) {
            const expires = cloudFrontExpiryUnix(nested)
            sendJson(res, 502, {
              error: 'aaf signature expired',
              detail: `wet3 returned an AllAccessFans CloudFront URL that expired at ${expires} (unix). Fresh stream-v2 calls are still serving stale signatures — AAF playback cannot work until wet3 refreshes tokens. Bunny/YouFanly videos should still play.`,
              expires,
            })
            return
          }

          const resolved = resolveWet3ProxyNestedUrl(nested)
          if (resolved) {
            await serveProxiedLocation(res, nested)
            return
          }
        } catch {
          // fall through to wet3 proxy
        }
        next()
      })()
      return
    }

    const match = url.match(/^\/wet3-api\/api\/stream-v2\/([^/?#]+)/)

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
    if (mediaId === 'proxy' || mediaId === 'proxy.m3u8' || mediaId === 'proxy-m3u8') {
      next()
      return
    }

    // Honor client-supplied st= (ad completion token) when present.
    const incoming = new URL(url, 'http://localhost')
    const existingSt = incoming.searchParams.get('st')
    const guestCookie = `wet3_user_id=${randomUUID()}`

    void (async () => {
      try {
        let targetUrl = existingSt
          ? streamV2UrlWithToken(mediaId, existingSt)
          : `${WET3_ORIGIN}/api/stream-v2/${encodeURIComponent(mediaId)}`

        let upstream = await fetchWet3Stream(targetUrl)

        // Wet3 now requires stream token after ads: 402 JSON stream_token_required.
        if (!upstream.headers.get('location') && upstream.status === 402) {
          const st = await obtainWet3StreamToken(mediaId, guestCookie)
          if (st) {
            targetUrl = streamV2UrlWithToken(mediaId, st)
            upstream = await fetchWet3Stream(targetUrl)
          }
        }

        const location = upstream.headers.get('location')
        if (location) {
          await serveProxiedLocation(res, location)
          return
        }

        res.statusCode = upstream.status
        const contentType = upstream.headers.get('content-type')
        if (contentType) {
          res.setHeader('Content-Type', contentType)
        }
        res.setHeader('Cache-Control', 'private, no-store')
        res.end(Buffer.from(await upstream.arrayBuffer()))
      } catch (error: unknown) {
        res.statusCode = 502
        res.setHeader('Content-Type', 'application/json')
        res.end(
          JSON.stringify({
            error: 'stream proxy failed',
            detail: error instanceof Error ? error.message : String(error),
          }),
        )
      }
    })()
  }
}
