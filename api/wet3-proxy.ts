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
 * Keep wet3 relative redirects on /wet3-api; send Bunny CDN to HLS proxy.
 *
 * AAF stays on wet3's proxy.m3u8 (direct CDN fetch with wet3 Referer → 401).
 * Playlists are rewritten below so `/api/stream-v2/...` becomes `/wet3-api/api/...`.
 */
function rewriteLocation(location: string): string {
  try {
    const absolute = location.startsWith('http')
      ? location
      : new URL(location, WET3_ORIGIN).href
    const parsed = new URL(absolute)

    // Bunny only — requires Referer: wet3.click via our HLS proxy.
    if (parsed.hostname.endsWith('.b-cdn.net')) {
      return hlsProxyPath(absolute)
    }

    // wet3 proxy.m3u8?url=Bunny → HLS proxy; AAF stays on /wet3-api proxy.
    if (parsed.pathname.includes('/api/stream-v2/proxy')) {
      const nested = parsed.searchParams.get('url')
      if (nested) {
        const nestedHost = new URL(nested).hostname
        if (nestedHost.endsWith('.b-cdn.net')) {
          return hlsProxyPath(nested)
        }
      }
      // AAF / other: keep on wet3-api so playlist body rewrite can fix /api/ paths
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

  try {
    const upstream = await fetch(targetUrl, {
      method,
      headers,
      body,
      redirect: 'manual',
    })

    res.status(upstream.status)

    const location = upstream.headers.get('location')
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

    const rawBody = Buffer.from(await upstream.arrayBuffer())
    const contentType = upstream.headers.get('content-type')
    res.end(rewritePlaylistBody(rawBody, contentType))
  } catch (error) {
    res.status(502)
    res.setHeader('content-type', 'application/json')
    res.end(
      JSON.stringify({
        error: 'wet3 proxy failed',
        detail: error instanceof Error ? error.message : String(error),
      }),
    )
  }
}
