import type { IncomingMessage, ServerResponse } from 'node:http'
import type { Connect } from 'vite'

const CONVEX = 'https://zealous-perch-126.convex.cloud'
const STREAM_CDN = 'https://vz-d849a0bc-fed.b-cdn.net'
const STREAM_LIBRARY = '494644'
const UA =
  'Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/131.0.0.0 Safari/537.36'

function sendJson(res: ServerResponse, status: number, body: unknown): void {
  res.statusCode = status
  res.setHeader('Content-Type', 'application/json')
  res.setHeader('Cache-Control', 'private, no-store')
  res.setHeader('Access-Control-Allow-Origin', '*')
  res.end(JSON.stringify(body))
}

async function convexQuery(
  path: string,
  args: Record<string, unknown>,
): Promise<unknown> {
  const upstream = await fetch(`${CONVEX}/api/query`, {
    method: 'POST',
    headers: {
      'Content-Type': 'application/json',
      'Convex-Client': 'npm-1.31.7',
      'User-Agent': UA,
    },
    body: JSON.stringify({ path, args, format: 'json' }),
  })
  return upstream.json()
}

const GUID_RE = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i

async function proxyStream(
  res: ServerResponse,
  guid: string,
  file: string,
): Promise<void> {
  if (!GUID_RE.test(guid)) {
    sendJson(res, 400, { error: 'invalid guid' })
    return
  }
  const safeFile = file.replace(/[^a-zA-Z0-9._/-]/g, '')
  if (!safeFile || safeFile.includes('..')) {
    sendJson(res, 400, { error: 'invalid file' })
    return
  }

  const target = `${STREAM_CDN}/${guid}/${safeFile}`
  const referer = `https://iframe.mediadelivery.net/embed/${STREAM_LIBRARY}/${guid}`

  const upstream = await fetch(target, {
    headers: {
      'User-Agent': UA,
      Referer: referer,
      Origin: 'https://iframe.mediadelivery.net',
    },
  })

  res.statusCode = upstream.status
  const ctype = upstream.headers.get('content-type')
  if (ctype) res.setHeader('Content-Type', ctype)
  res.setHeader('Cache-Control', 'private, max-age=300')
  res.setHeader('Access-Control-Allow-Origin', '*')
  const buf = Buffer.from(await upstream.arrayBuffer())
  res.end(buf)
}

export function createFtProxyMiddleware(): Connect.NextHandleFunction {
  return (req: IncomingMessage, res: ServerResponse, next: Connect.NextFunction) => {
    const url = req.url ?? ''

    if (url.startsWith('/api/ft-stream')) {
      const parsed = new URL(url, 'http://localhost')
      const guid = parsed.searchParams.get('guid') ?? ''
      const file = parsed.searchParams.get('file') ?? 'play_720p.mp4'
      void proxyStream(res, guid, file).catch((err: unknown) => {
        sendJson(res, 502, {
          error: err instanceof Error ? err.message : String(err),
        })
      })
      return
    }

    if (!url.startsWith('/api/ft')) {
      next()
      return
    }

    const method = (req.method ?? 'GET').toUpperCase()
    if (method !== 'GET') {
      sendJson(res, 405, { error: 'Method not allowed' })
      return
    }

    const parsed = new URL(url, 'http://localhost')
    const op = parsed.searchParams.get('op') ?? 'posts'

    void (async () => {
      if (op === 'posts') {
        const body = await convexQuery('posts:getAllPosts', {})
        sendJson(res, 200, body)
        return
      }
      if (op === 'profile') {
        const username = (parsed.searchParams.get('username') ?? '').trim()
        if (!username) {
          sendJson(res, 400, { error: 'missing username' })
          return
        }
        const body = await convexQuery('users:getUserProfile', { username })
        sendJson(res, 200, body)
        return
      }
      if (op === 'post') {
        const postId = (parsed.searchParams.get('id') ?? '').trim()
        if (!postId) {
          sendJson(res, 400, { error: 'missing id' })
          return
        }
        const body = await convexQuery('posts:getPost', { postId })
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
