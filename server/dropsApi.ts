import type { ServerResponse } from 'node:http'
import type { Connect } from 'vite'
import { fetchSlimDrops, resolveDrop } from './dropsCore'

function sendJson(res: ServerResponse, status: number, body: unknown) {
  res.statusCode = status
  res.setHeader('Content-Type', 'application/json; charset=utf-8')
  res.end(JSON.stringify(body))
}

export function createDropsMiddleware(): Connect.NextHandleFunction {
  return (req, res, next) => {
    const url = req.url ?? ''

    if (url === '/api/drops' || url.startsWith('/api/drops?')) {
      void fetchSlimDrops()
        .then((drops) => {
          res.setHeader('cache-control', 'public, max-age=15')
          sendJson(res, 200, { success: true, drops })
        })
        .catch((error: unknown) => {
          sendJson(res, 502, {
            error: 'drops catalog failed',
            detail: error instanceof Error ? error.message : String(error),
          })
        })
      return
    }

    const dropMatch = url.match(/^\/api\/drop(?:\?|$)/)
    if (dropMatch) {
      const params = new URL(url, 'http://localhost').searchParams
      const dropId = Number.parseInt(params.get('id') ?? '', 10)

      if (!Number.isFinite(dropId) || dropId <= 0) {
        sendJson(res, 400, { error: 'missing or invalid id' })
        return
      }

      const unlockParam = params.get('unlock')
      const unlock = unlockParam !== '0' && unlockParam !== 'false'

      void resolveDrop(dropId, { unlock })
        .then((result) => {
          if (!result.drop) {
            sendJson(res, 404, { error: 'drop not found' })
            return
          }

          sendJson(res, 200, {
            success: true,
            unlockedNow: result.unlockedNow,
            drop: result.drop,
          })
        })
        .catch((error: unknown) => {
          sendJson(res, 502, {
            error: 'drop resolve failed',
            detail: error instanceof Error ? error.message : String(error),
          })
        })
      return
    }

    next()
  }
}
