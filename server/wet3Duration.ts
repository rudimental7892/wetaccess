import type { Connect } from 'vite'
import { fetchWet3VideoDuration } from './durationCore'

export { fetchWet3VideoDuration } from './durationCore'

export function createDurationMiddleware(): Connect.NextHandleFunction {
  return (req, res, next) => {
    const url = req.url ?? ''
    if (!url.startsWith('/api/duration') && !url.startsWith('/local-api/duration')) {
      next()
      return
    }

    let mediaId = ''
    try {
      const parsed = new URL(url, 'http://localhost')
      mediaId = parsed.searchParams.get('id') || ''
      if (!mediaId) {
        const pathMatch = parsed.pathname.match(/\/duration\/([^/]+)/)
        if (pathMatch) {
          mediaId = decodeURIComponent(pathMatch[1])
        }
      }
    } catch {
      next()
      return
    }

    if (!mediaId) {
      res.statusCode = 400
      res.setHeader('Content-Type', 'application/json')
      res.end(JSON.stringify({ duration: null }))
      return
    }

    void fetchWet3VideoDuration(mediaId)
      .then((duration) => {
        res.setHeader('Content-Type', 'application/json')
        res.end(JSON.stringify({ duration }))
      })
      .catch(() => {
        res.statusCode = 500
        res.setHeader('Content-Type', 'application/json')
        res.end(JSON.stringify({ duration: null }))
      })
  }
}
