import type { Connect } from 'vite'
import { fetchCreatorsFromWet3 } from './creatorsCore'

/**
 * GET /api/creators-catalog?page=&limit=&search=&twitterOnly=
 * Returns JSON scraped from wet3 HTML tiles.
 */
export function createCreatorsMiddleware(): Connect.NextHandleFunction {
  return (req, res, next) => {
    const url = req.url ?? ''
    if (!url.startsWith('/api/creators-catalog')) {
      next()
      return
    }

    if ((req.method ?? 'GET').toUpperCase() !== 'GET') {
      res.statusCode = 405
      res.setHeader('Content-Type', 'application/json')
      res.end(JSON.stringify({ error: 'Method not allowed' }))
      return
    }

    void (async () => {
      try {
        const parsed = new URL(url, 'http://localhost')
        const page = Number.parseInt(parsed.searchParams.get('page') ?? '1', 10) || 1
        const limit = Number.parseInt(parsed.searchParams.get('limit') ?? '24', 10) || 24
        const search = parsed.searchParams.get('search') ?? undefined
        const twitterOnly = parsed.searchParams.get('twitterOnly') === 'true'

        const data = await fetchCreatorsFromWet3({ page, limit, search, twitterOnly })
        res.statusCode = 200
        res.setHeader('Content-Type', 'application/json; charset=utf-8')
        res.setHeader('Cache-Control', 'private, max-age=30')
        res.end(JSON.stringify(data))
      } catch (error: unknown) {
        res.statusCode = 502
        res.setHeader('Content-Type', 'application/json')
        res.end(
          JSON.stringify({
            error: 'creators catalog failed',
            detail: error instanceof Error ? error.message : String(error),
            items: [],
            total: 0,
            page: 1,
            limit: 24,
          }),
        )
      }
    })()
  }
}
