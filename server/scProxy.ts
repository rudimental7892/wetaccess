import type { IncomingMessage, ServerResponse } from 'node:http'
import type { Connect } from 'vite'

const SC_API = 'https://api.switcity.com'
const SC_WEB = 'https://switcity.com'

const BROWSER_HEADERS: Record<string, string> = {
  'User-Agent':
    'Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/131.0.0.0 Safari/537.36',
  Accept: 'application/json, text/html, */*',
  'Accept-Language': 'en-US,en;q=0.9',
}

function sendJson(res: ServerResponse, status: number, body: unknown): void {
  res.statusCode = status
  res.setHeader('Content-Type', 'application/json')
  res.setHeader('Cache-Control', 'private, no-store')
  res.setHeader('Access-Control-Allow-Origin', '*')
  res.end(JSON.stringify(body))
}

async function proxyApi(path: string): Promise<{ status: number; body: string; contentType: string }> {
  const res = await fetch(`${SC_API}${path}`, { headers: BROWSER_HEADERS })
  return {
    status: res.status,
    body: await res.text(),
    contentType: res.headers.get('content-type') ?? 'application/json',
  }
}

async function scrapeNextData(path: string): Promise<unknown> {
  const res = await fetch(`${SC_WEB}${path}`, {
    headers: {
      ...BROWSER_HEADERS,
      Accept: 'text/html',
    },
  })
  const html = await res.text()

  const match = html.match(/<script\s+id="__NEXT_DATA__"[^>]*>([\s\S]*?)<\/script>/)
  if (match?.[1]) {
    return JSON.parse(match[1])
  }

  const rscChunks: unknown[] = []
  const rscPattern = /\d+:(\[[\s\S]*?\])\n/g
  let rscMatch: RegExpExecArray | null
  while ((rscMatch = rscPattern.exec(html)) !== null) {
    try {
      rscChunks.push(JSON.parse(rscMatch[1]))
    } catch { /* skip non-JSON chunks */ }
  }
  if (rscChunks.length > 0) return { rscChunks }

  return null
}

export function createScProxyMiddleware(): Connect.NextHandleFunction {
  return (req: IncomingMessage, res: ServerResponse, next: Connect.NextFunction) => {
    const url = req.url ?? ''
    if (!url.startsWith('/api/sc')) {
      next()
      return
    }

    const method = (req.method ?? 'GET').toUpperCase()
    if (method !== 'GET') {
      sendJson(res, 405, { error: 'Method not allowed' })
      return
    }

    const parsed = new URL(url, 'http://localhost')
    const op = parsed.searchParams.get('op') ?? 'health'

    void (async () => {
      try {
        if (op === 'health') {
          const data = await proxyApi('/health')
          res.statusCode = data.status
          res.setHeader('Content-Type', data.contentType)
          res.setHeader('Cache-Control', 'private, no-store')
          res.setHeader('Access-Control-Allow-Origin', '*')
          res.end(data.body)
          return
        }

        if (op === 'discover') {
          const nextData = await scrapeNextData('/discover')
          if (nextData) {
            sendJson(res, 200, { source: 'ssr', data: nextData })
            return
          }
          sendJson(res, 200, { source: 'empty', data: null })
          return
        }

        if (op === 'creator') {
          const username = parsed.searchParams.get('username') ?? ''
          if (!username) {
            sendJson(res, 400, { error: 'missing username' })
            return
          }
          const nextData = await scrapeNextData(`/${encodeURIComponent(username)}`)
          if (nextData) {
            sendJson(res, 200, { source: 'ssr', data: nextData })
            return
          }
          sendJson(res, 200, { source: 'empty', data: null })
          return
        }

        if (op === 'api') {
          const path = parsed.searchParams.get('path') ?? '/'
          const data = await proxyApi(path)
          res.statusCode = data.status
          res.setHeader('Content-Type', data.contentType)
          res.setHeader('Cache-Control', 'private, no-store')
          res.setHeader('Access-Control-Allow-Origin', '*')
          res.end(data.body)
          return
        }

        sendJson(res, 400, { error: `unknown op: ${op}` })
      } catch (error: unknown) {
        sendJson(res, 502, {
          error: 'sc proxy failed',
          detail: error instanceof Error ? error.message : String(error),
        })
      }
    })()
  }
}
