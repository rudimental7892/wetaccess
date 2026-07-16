import { randomUUID } from 'node:crypto'
import type { IncomingMessage } from 'node:http'

type VercelRequest = IncomingMessage & {
  query: {
    path?: string | string[]
  }
  body?: unknown
  method?: string
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

function targetPath(req: VercelRequest): string {
  const raw = req.query.path
  if (Array.isArray(raw)) {
    return raw.map((part) => decodeURIComponent(part)).join('/')
  }
  if (typeof raw === 'string' && raw.length > 0) {
    return decodeURIComponent(raw)
  }

  const url = req.url ?? ''
  const match = url.match(/^\/api\/wet3-api\/?([^?]*)/)
  return match?.[1] ? decodeURIComponent(match[1]) : ''
}

function rewriteLocation(location: string): string {
  if (location.startsWith('/')) {
    return `/wet3-api${location}`
  }

  if (location.startsWith(`${WET3_ORIGIN}/`)) {
    return `/wet3-api/${location.slice(`${WET3_ORIGIN}/`.length)}`
  }

  return location
}

export default async function handler(req: VercelRequest, res: VercelResponse) {
  const path = targetPath(req)
  const searchIndex = (req.url ?? '').indexOf('?')
  const search = searchIndex >= 0 ? (req.url ?? '').slice(searchIndex) : ''
  const targetUrl = `${WET3_ORIGIN}/${path}${search}`

  const headers: Record<string, string> = {
    'User-Agent':
      (typeof req.headers['user-agent'] === 'string' && req.headers['user-agent']) ||
      'Mozilla/5.0 (compatible; wetaccess-proxy/1.0)',
    Accept: (typeof req.headers.accept === 'string' && req.headers.accept) || '*/*',
    Cookie: `wet3_user_id=${randomUUID()}`,
  }

  if (typeof req.headers['content-type'] === 'string') {
    headers['Content-Type'] = req.headers['content-type']
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

    // Avoid caching Turnstile/challenge shells or personalized HTML.
    if (!upstream.headers.get('cache-control')) {
      res.setHeader('cache-control', 'private, no-store')
    }

    const buffer = Buffer.from(await upstream.arrayBuffer())
    res.end(buffer)
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
