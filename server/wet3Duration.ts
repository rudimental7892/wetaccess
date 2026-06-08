import type { Connect } from 'vite'
import { fetchWet3VideoDuration } from './durationCore'

export { fetchWet3VideoDuration } from './durationCore'

export function createDurationMiddleware(): Connect.NextHandleFunction {
  return (req, res, next) => {
    const match = req.url?.match(/^\/(?:local-api|api)\/duration\/([^/?]+)/)

    if (!match) {
      next()
      return
    }

    const mediaId = decodeURIComponent(match[1])

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
