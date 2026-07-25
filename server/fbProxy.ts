import type { IncomingMessage, ServerResponse } from 'node:http'
import type { Connect } from 'vite'

const FB_API = 'https://fb-services.fanbusy.com:9105/api/v1'
const UA =
  'Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/131.0.0.0 Safari/537.36'

function sendJson(res: ServerResponse, status: number, body: unknown): void {
  res.statusCode = status
  res.setHeader('Content-Type', 'application/json')
  res.setHeader('Cache-Control', 'private, no-store')
  res.end(JSON.stringify(body))
}

function sanitizePath(raw: string): string | null {
  const cleaned = raw.replace(/^\/+/, '').replace(/\.\./g, '')
  if (!cleaned || cleaned.includes('://')) return null
  return cleaned
}

export function createFbProxyMiddleware(): Connect.NextHandleFunction {
  return (req: IncomingMessage, res: ServerResponse, next: Connect.NextFunction) => {
    const url = req.url ?? ''
    if (!url.startsWith('/api/fb')) {
      next()
      return
    }

    const method = (req.method ?? 'GET').toUpperCase()
    if (method !== 'GET' && method !== 'POST') {
      sendJson(res, 405, { error: 'Method not allowed' })
      return
    }

    const parsed = new URL(url, 'http://localhost')
    const path = sanitizePath(parsed.searchParams.get('path') ?? '')
    if (!path) {
      sendJson(res, 400, { error: 'missing or invalid path' })
      return
    }

    parsed.searchParams.delete('path')
    const search = parsed.searchParams.toString()
    const target = `${FB_API}/${path}${search ? `?${search}` : ''}`

    void fetch(target, {
      method,
      headers: {
        'User-Agent': UA,
        Accept: 'application/json',
        Origin: 'https://www.fanbusy.com',
        Referer: 'https://www.fanbusy.com/',
      },
    })
      .then(async (upstream) => {
        const text = await upstream.text()
        res.statusCode = upstream.status
        res.setHeader('Content-Type', 'application/json')
        res.setHeader('Cache-Control', 'private, no-store')
        res.end(text)
      })
      .catch((err: unknown) => {
        sendJson(res, 502, {
          error: err instanceof Error ? err.message : String(err),
        })
      })
  }
}
