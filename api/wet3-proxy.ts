import { randomUUID } from 'node:crypto'

type VercelRequest = {
  method?: string
  url?: string
  query: Record<string, string | string[] | undefined>
  headers: Record<string, string | string[] | undefined>
  body?: unknown
}

type VercelResponse = {
  status: (code: number) => VercelResponse
  setHeader: (name: string, value: string | number) => void
  end: (body?: string | Buffer) => void
}

export const config = {
  api: {
    bodyParser: true,
    responseLimit: false,
  },
  maxDuration: 60,
}

const WET3_ORIGIN = 'https://wet3.click'
const HOP_BY_HOP = new Set([
  'connection',
  'keep-alive',
  'proxy-authenticate',
  'proxy-authorization',
  'te',
  'trailers',
  'transfer-encoding',
  'upgrade',
  'content-encoding',
  'content-length',
])

function headerValue(value: string | string[] | undefined): string | undefined {
  if (Array.isArray(value)) return value[0]
  return value
}

function hlsProxyPath(targetUrl: string): string {
  return `/api/hls-proxy?url=${encodeURIComponent(targetUrl)}`
}

/**
 * wet3 stream-v2 maps AAF stills to a non-existent
 * `/streaming/image/.../file.jpg.m3u8` playlist. The real asset is
 * `/image/.../file.jpg` and requires an AllAccessFans Referer (via hls-proxy).
 */
function aafStillUrlFromFakeHls(nested: string): string | null {
  try {
    const url = new URL(nested)
    if (!url.hostname.endsWith('allaccessfans.co')) {
      return null
    }
    if (!url.pathname.includes('/streaming/image/')) {
      return null
    }
    if (!/\.(jpe?g|png|gif|webp)\.m3u8$/i.test(url.pathname)) {
      return null
    }
    url.pathname = url.pathname
      .replace('/streaming/image/', '/image/')
      .replace(/\.m3u8$/i, '')
    return url.href
  } catch {
    return null
  }
}

/**
 * Keep wet3 relative redirects on /wet3-api; send Bunny CDN / AAF stills to HLS proxy.
 */
function rewriteLocation(location: string): string {
  try {
    const absolute = location.startsWith('http')
      ? location
      : new URL(location, WET3_ORIGIN).href
    const parsed = new URL(absolute)

    if (parsed.hostname.endsWith('.b-cdn.net')) {
      return hlsProxyPath(absolute)
    }

    if (parsed.pathname.includes('/api/stream-v2/proxy')) {
      const nested = parsed.searchParams.get('url')
      if (nested) {
        const still = aafStillUrlFromFakeHls(nested)
        if (still) {
          return hlsProxyPath(still)
        }

        const nestedHost = new URL(nested).hostname
        if (nestedHost.endsWith('.b-cdn.net')) {
          return hlsProxyPath(nested)
        }
      }
      if (absolute.startsWith(`${WET3_ORIGIN}/`)) {
        return `/wet3-api/${absolute.slice(`${WET3_ORIGIN}/`.length)}`
      }
      if (location.startsWith('/')) {
        return `/wet3-api${location}`
      }
    }

    if (absolute.startsWith(`${WET3_ORIGIN}/`)) {
      return `/wet3-api/${absolute.slice(`${WET3_ORIGIN}/`.length)}`
    }
  } catch {
    // fall through
  }

  if (location.startsWith('/')) {
    return `/wet3-api${location}`
  }

  return location
}

/** Rewrite wet3-absolute API paths inside m3u8 bodies to stay on /wet3-api. */
function rewritePlaylistBody(body: Buffer, contentType: string | null): Buffer {
  const ct = contentType ?? ''
  const head = body.subarray(0, 7).toString('utf8')
  const isPlaylist =
    ct.includes('mpegurl') || ct.includes('m3u8') || head.startsWith('#EXTM3U')

  if (!isPlaylist) {
    return body
  }

  const text = body.toString('utf8')
  const rewritten = text
    .split('\n')
    .map((line) => {
      const trimmed = line.trim()
      if (!trimmed || trimmed.startsWith('#')) {
        return line.replace(
          /URI="(\/api\/[^"]+)"/gi,
          (_m, path: string) => `URI="/wet3-api${path}"`,
        )
      }
      if (trimmed.startsWith('/api/')) {
        return `/wet3-api${trimmed}`
      }
      if (trimmed.startsWith(`${WET3_ORIGIN}/`)) {
        return `/wet3-api/${trimmed.slice(`${WET3_ORIGIN}/`.length)}`
      }
      return line
    })
    .join('\n')

  return Buffer.from(rewritten)
}

export default async function handler(req: VercelRequest, res: VercelResponse) {
  const rawPath = req.query.path
  const path = Array.isArray(rawPath) ? rawPath.join('/') : (rawPath ?? '')

  if (!path) {
    res.status(400)
    res.setHeader('content-type', 'application/json')
    res.end(JSON.stringify({ error: 'missing path' }))
    return
  }

  const incomingUrl = new URL(req.url ?? '/', 'http://localhost')
  incomingUrl.searchParams.delete('path')

  // AAF stills: wet3's proxy.m3u8 points at a missing *.jpg.m3u8 — unwrap to the real /image/ asset.
  if (path.includes('api/stream-v2/proxy')) {
    const nested = incomingUrl.searchParams.get('url')
    const still = nested ? aafStillUrlFromFakeHls(nested) : null
    if (still) {
      res.status(302)
      res.setHeader('location', hlsProxyPath(still))
      res.setHeader('cache-control', 'private, no-store')
      res.end()
      return
    }
  }

  const search = incomingUrl.searchParams.toString()
  const targetUrl = `${WET3_ORIGIN}/${path}${search ? `?${search}` : ''}`

  const headers: Record<string, string> = {
    'User-Agent':
      headerValue(req.headers['user-agent']) || 'Mozilla/5.0 (compatible; wetaccess-proxy/1.0)',
    // Never forward browser Referer — wet3 403s stream-v2 when Referer is wetaccess.
    Accept: '*/*',
    Referer: `${WET3_ORIGIN}/`,
    Origin: WET3_ORIGIN,
    Cookie: `wet3_user_id=${randomUUID()}`,
  }

  const contentType = headerValue(req.headers['content-type'])
  if (contentType) {
    headers['Content-Type'] = contentType
  }

  const method = (req.method ?? 'GET').toUpperCase()
  let body: string | undefined
  if (method !== 'GET' && method !== 'HEAD' && req.body != null) {
    body = typeof req.body === 'string' ? req.body : JSON.stringify(req.body)
    if (!headers['Content-Type']) {
      headers['Content-Type'] = 'application/json'
    }
  }

  // AAF stream broker on wet3 is flaky (plain "Proxy Error" / timeouts). Retry a few times.
  const isStreamPath = path.includes('api/stream-v2/')
  const maxAttempts = isStreamPath ? 4 : 1
  let lastDetail = 'wet3 proxy failed'

  for (let attempt = 0; attempt < maxAttempts; attempt += 1) {
    try {
      const upstream = await fetch(targetUrl, {
        method,
        headers: {
          ...headers,
          // Fresh guest id per attempt — wet3 sometimes sticks a bad broker session.
          Cookie: `wet3_user_id=${randomUUID()}`,
        },
        body,
        redirect: 'manual',
      })

      const location = upstream.headers.get('location')
      const rawBody = Buffer.from(await upstream.arrayBuffer())
      const upstreamContentType = upstream.headers.get('content-type')
      const preview = rawBody.subarray(0, 64).toString('utf8').trim()
      const proxyError = /^Proxy Error\b/i.test(preview)

      if (proxyError) {
        lastDetail = 'wet3 stream broker returned Proxy Error'
        if (attempt < maxAttempts - 1) {
          await new Promise((resolve) => setTimeout(resolve, 400 * (attempt + 1)))
          continue
        }

        const nested = incomingUrl.searchParams.get('url') ?? ''
        const isAaf =
          path.includes('stream-v2/proxy') && nested.includes('allaccessfans.co')

        res.status(502)
        res.setHeader('content-type', 'application/json')
        res.setHeader('cache-control', 'private, no-store')
        res.end(
          JSON.stringify({
            error: 'wet3 upstream proxy error',
            detail: isAaf
              ? `${lastDetail} after ${maxAttempts} attempts — AAF CDN requires CloudFront cookies; wet3 broker cannot fetch playlists right now`
              : `${lastDetail} after ${maxAttempts} attempts`,
            path,
            source: isAaf ? 'allaccessfans' : 'wet3',
          }),
        )
        return
      }

      res.status(upstream.status)

      if (location) {
        res.setHeader('location', rewriteLocation(location))
      }

      upstream.headers.forEach((value, key) => {
        const lower = key.toLowerCase()
        if (HOP_BY_HOP.has(lower) || lower === 'set-cookie' || lower === 'location') {
          return
        }
        res.setHeader(key, value)
      })

      if (!upstream.headers.get('cache-control')) {
        res.setHeader('cache-control', 'private, no-store')
      }

      res.end(rewritePlaylistBody(rawBody, upstreamContentType))
      return
    } catch (error) {
      lastDetail = error instanceof Error ? error.message : String(error)
      if (attempt < maxAttempts - 1) {
        await new Promise((resolve) => setTimeout(resolve, 250 * (attempt + 1)))
        continue
      }
    }
  }

  res.status(502)
  res.setHeader('content-type', 'application/json')
  res.end(
    JSON.stringify({
      error: 'wet3 proxy failed',
      detail: lastDetail,
    }),
  )
}
