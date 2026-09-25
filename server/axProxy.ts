import type { IncomingMessage, ServerResponse } from 'node:http'
import type { Connect } from 'vite'

const AXESSLY_API = 'https://api.axessly.co'
const TOKEN = 'VHlkZRba4kIgiHUVV1QJ6Ox0KzovyLsw'
const UA =
  'Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/131.0.0.0 Safari/537.36'

function sendJson(res: ServerResponse, status: number, body: unknown): void {
  res.statusCode = status
  res.setHeader('Content-Type', 'application/json')
  res.setHeader('Cache-Control', 'private, no-store')
  res.setHeader('Access-Control-Allow-Origin', '*')
  res.end(JSON.stringify(body))
}

async function axFetch(path: string): Promise<unknown> {
  const upstream = await fetch(`${AXESSLY_API}${path}`, {
    headers: {
      Authorization: `Bearer ${TOKEN}`,
      'User-Agent': UA,
      Accept: 'application/json',
    },
  })
  return upstream.json()
}

export function createAxProxyMiddleware(): Connect.NextHandleFunction {
  return (
    req: IncomingMessage,
    res: ServerResponse,
    next: Connect.NextFunction,
  ) => {
    const url = req.url ?? ''
    if (!url.startsWith('/api/ax')) {
      next()
      return
    }

    const method = (req.method ?? 'GET').toUpperCase()
    if (method !== 'GET') {
      sendJson(res, 405, { error: 'Method not allowed' })
      return
    }

    const parsed = new URL(url, 'http://localhost')
    const op = parsed.searchParams.get('op') ?? 'creators'

    void (async () => {
      if (op === 'creators') {
        const limit = parsed.searchParams.get('limit') ?? '100'
        const body = await axFetch(`/api/explore/creators?limit=${limit}`)
        sendJson(res, 200, body)
        return
      }
      if (op === 'posts') {
        const username = (
          parsed.searchParams.get('username') ?? ''
        ).trim()
        if (!username) {
          sendJson(res, 400, { error: 'missing username' })
          return
        }
        const body = await axFetch(
          `/api/posts/user/${encodeURIComponent(username)}`,
        )
        sendJson(res, 200, body)
        return
      }
      if (op === 'feed') {
        const limit = parsed.searchParams.get('limit') ?? '50'
        const body = await axFetch(`/api/feed?limit=${limit}`)
        sendJson(res, 200, body)
        return
      }
      if (op === 'reels') {
        const limit = parsed.searchParams.get('limit') ?? '50'
        const body = await axFetch(`/api/posts/reels?limit=${limit}`)
        sendJson(res, 200, body)
        return
      }
      sendJson(res, 400, { error: 'unknown op' })
    })().catch((err: unknown) => {
      sendJson(res, 502, {
        error: err instanceof Error ? err.message : String(err),
      })
    })
  }
}
