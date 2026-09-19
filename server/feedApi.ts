import type { ServerResponse } from 'node:http'
import type { Connect } from 'vite'
import { fetchFeedPage } from './feedCore'

function sendJson(res: ServerResponse, status: number, body: unknown) {
  res.statusCode = status
  res.setHeader('Content-Type', 'application/json; charset=utf-8')
  res.end(JSON.stringify(body))
}

export function createFeedMiddleware(): Connect.NextHandleFunction {
  return (req, res, next) => {
    const url = req.url ?? ''

    if (url !== '/api/feed' && !url.startsWith('/api/feed?')) {
      next()
      return
    }

    const params = new URL(url, 'http://localhost').searchParams
    const page = Math.max(1, Number.parseInt(params.get('page') ?? '1', 10) || 1)

    void fetchFeedPage(page)
      .then((result) => {
        res.setHeader('cache-control', 'public, max-age=30')
        sendJson(res, 200, { success: true, ...result })
      })
      .catch((error: unknown) => {
        sendJson(res, 502, {
          error: 'feed failed',
          detail: error instanceof Error ? error.message : String(error),
        })
      })
  }
}
