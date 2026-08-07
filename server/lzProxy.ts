import type { IncomingMessage, ServerResponse } from 'node:http'
import type { Connect } from 'vite'
import {
  fetchLzCreators,
  fetchLzProfile,
  fetchLzStream,
} from '../api/_lib/leakedzoneCore'

function sendJson(res: ServerResponse, status: number, body: unknown): void {
  res.statusCode = status
  res.setHeader('Content-Type', 'application/json')
  res.setHeader('Cache-Control', 'private, no-store')
  res.setHeader('Access-Control-Allow-Origin', '*')
  res.end(JSON.stringify(body))
}

export function createLzProxyMiddleware(): Connect.NextHandleFunction {
  return (req: IncomingMessage, res: ServerResponse, next: Connect.NextFunction) => {
    const url = req.url ?? ''
    if (!url.startsWith('/api/lz')) {
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
        const page = Number.parseInt(parsed.searchParams.get('page') ?? '1', 10)
        const networks = parsed.searchParams.get('networks') ?? ''
        const sort = parsed.searchParams.get('sort') ?? ''
        const body = await fetchLzCreators({
          page: Number.isFinite(page) ? page : 1,
          networks: networks || undefined,
          sort: sort || undefined,
        })
        sendJson(res, 200, body)
        return
      }

      if (op === 'profile') {
        const slug = (parsed.searchParams.get('slug') ?? '').trim()
        if (!slug) {
          sendJson(res, 400, { error: 'missing slug' })
          return
        }
        const tabRaw = parsed.searchParams.get('tab') ?? 'video'
        const tab = tabRaw === 'photo' ? 'photo' : 'video'
        const page = Number.parseInt(parsed.searchParams.get('page') ?? '1', 10)
        const sort = parsed.searchParams.get('sort') ?? 'newest'
        const body = await fetchLzProfile({
          slug,
          tab,
          page: Number.isFinite(page) ? page : 1,
          sort,
        })
        sendJson(res, 200, body)
        return
      }

      if (op === 'stream') {
        const slug = (parsed.searchParams.get('slug') ?? '').trim()
        const id = (parsed.searchParams.get('id') ?? '').trim()
        if (!slug || !id) {
          sendJson(res, 400, { error: 'missing slug or id' })
          return
        }
        const body = await fetchLzStream(slug, id)
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
