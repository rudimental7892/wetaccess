import { randomUUID } from 'node:crypto'
import { rewriteStreamLocation } from './_lib/hlsProxyCore'

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
  maxDuration: 30,
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

export default async function handler(req: VercelRequest, res: VercelResponse) {
  const rawPath = req.query.path
  const path = Array.isArray(rawPath) ? rawPath.join('/') : (rawPath ?? '')

  if (!path) {
    res.status(400)
    res.setHeader('content-type', 'application/json')
    res.end(JSON.stringify({ error: 'missing path' }))
    return
  }

  // Preserve original query string except our path param.
  const incomingUrl = new URL(req.url ?? '/', 'http://localhost')
  incomingUrl.searchParams.delete('path')
  const search = incomingUrl.searchParams.toString()
  const targetUrl = `${WET3_ORIGIN}/${path}${search ? `?${search}` : ''}`

  const headers: Record<string, string> = {
    'User-Agent': headerValue(req.headers['user-agent']) || 'Mozilla/5.0 (compatible; wetaccess-proxy/1.0)',
    // Do not forward the browser Referer — wet3 now 403s stream-v2 when Referer is wetaccess.
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
      res.setHeader('location', rewriteStreamLocation(location))
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

    res.end(Buffer.from(await upstream.arrayBuffer()))
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
