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

const PLAYLIST_CACHE_MAX = 500
const PLAYLIST_CACHE_TTL_MS = 60 * 60 * 1000 // 1 hour — Bunny UUIDs are stable
const playlistCache = new Map<string, { url: string; at: number }>()

function getCachedPlaylist(mediaId: string): string | null {
  const entry = playlistCache.get(mediaId)
  if (!entry) return null
  if (Date.now() - entry.at > PLAYLIST_CACHE_TTL_MS) {
    playlistCache.delete(mediaId)
    return null
  }
  return entry.url
}

function cachePlaylist(mediaId: string, url: string) {
  playlistCache.set(mediaId, { url, at: Date.now() })
  if (playlistCache.size > PLAYLIST_CACHE_MAX) {
    const oldest = playlistCache.keys().next().value
    if (oldest) playlistCache.delete(oldest)
  }
}

/**
 * Derive Bunny CDN HLS playlist from wet3's image API.
 * `/api/image/{id}` → 303 → `https://vz-xxx.b-cdn.net/{uuid}/preview.webp`
 * Replace `preview.webp` with `playlist.m3u8` to get the stream.
 */
async function resolveBunnyPlaylist(mediaId: string): Promise<string | null> {
  try {
    const r = await fetch(`${WET3_ORIGIN}/api/image/${encodeURIComponent(mediaId)}`, {
      method: 'GET',
      redirect: 'manual',
      headers: wet3FetchHeaders({}),
    })
    const loc = r.headers.get('location')
    if (!loc) return null
    const match = loc.match(/(https?:\/\/vz-[a-f0-9-]+\.b-cdn\.net\/[a-f0-9-]+\/)preview\.\w+/i)
    if (!match) return null
    return `${match[1]}playlist.m3u8`
  } catch {
    return null
  }
}

const BUNNY_PLAYLIST_RE = /https?:\/\/vz-[a-f0-9-]+\.b-cdn\.net\/[a-f0-9-]+\/playlist\.m3u8/i

/**
 * Resolve playlist via the monetized-link → ad-complete → player page flow.
 * Some videos return 200 from /api/image (thumbnail served directly, not a 303
 * redirect to Bunny CDN), but their player page embeds the Bunny playlist URL.
 */
async function resolvePlaylistFromPlayerPage(
  mediaId: string,
  st: string,
): Promise<string | null> {
  try {
    const r = await fetch(
      `${WET3_ORIGIN}/p/${encodeURIComponent(mediaId)}?st=${encodeURIComponent(st)}`,
      {
        method: 'GET',
        redirect: 'follow',
        headers: wet3FetchHeaders({
          Cookie: `wet3_user_id=${randomUUID()}`,
        }),
      },
    )
    if (!r.ok) return null
    const html = await r.text()
    const match = html.match(BUNNY_PLAYLIST_RE)
    return match ? match[0] : null
  } catch {
    return null
  }
}

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
        // Instant path: serve from cache (Bunny UUIDs are stable).
        const cached = getCachedPlaylist(mediaId)
        if (cached) {
          await serveProxiedLocation(res, cached)
          return
        }

        // Run Bunny fast-path and token acquisition in parallel so the
        // monetized-link round-trips overlap with the image-API probe.
        const [bunnyResult, tokenResult] = await Promise.all([
          resolveBunnyPlaylist(mediaId),
          existingSt
            ? Promise.resolve(existingSt)
            : obtainWet3StreamToken(mediaId, guestCookie),
        ])

        if (bunnyResult) {
          cachePlaylist(mediaId, bunnyResult)
          await serveProxiedLocation(res, bunnyResult)
          return
        }

        // Second path: scrape the player page for an embedded Bunny playlist.
        if (tokenResult) {
          const playerPlaylist = await resolvePlaylistFromPlayerPage(mediaId, tokenResult)
          if (playerPlaylist) {
            cachePlaylist(mediaId, playerPlaylist)
            await serveProxiedLocation(res, playerPlaylist)
            return
          }
        }

        // Fallback: try stream-v2 in case wet3 restores it or for non-Bunny media.
        const st = tokenResult
        let targetUrl = st
          ? streamV2UrlWithToken(mediaId, st)
          : `${WET3_ORIGIN}/api/stream-v2/${encodeURIComponent(mediaId)}`

        let upstream = await fetchWet3Stream(targetUrl)

        if (!upstream.headers.get('location') && (upstream.status === 402 || upstream.status === 400) && !st) {
          const freshSt = await obtainWet3StreamToken(mediaId, guestCookie)
          if (freshSt) {
            targetUrl = streamV2UrlWithToken(mediaId, freshSt)
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
