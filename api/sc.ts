type VercelRequest = {
  method?: string
  query: Record<string, string | string[] | undefined>
}

type VercelResponse = {
  status: (code: number) => VercelResponse
  setHeader: (name: string, value: string | number) => void
  end: (body?: string | Buffer) => void
}

export const config = {
  maxDuration: 30,
}

const SC_API = 'https://api.switcity.com'
const SC_WEB = 'https://switcity.com'

const BROWSER_HEADERS: Record<string, string> = {
  'User-Agent':
    'Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/131.0.0.0 Safari/537.36',
  Accept: 'application/json, text/html, */*',
  'Accept-Language': 'en-US,en;q=0.9',
}

function sendJson(res: VercelResponse, status: number, body: unknown): void {
  res.status(status)
  res.setHeader('Content-Type', 'application/json')
  res.setHeader('Cache-Control', 'private, no-store')
  res.setHeader('Access-Control-Allow-Origin', '*')
  res.end(JSON.stringify(body))
}

async function proxyApi(path: string): Promise<{ status: number; body: string; contentType: string }> {
  const r = await fetch(`${SC_API}${path}`, { headers: BROWSER_HEADERS })
  return {
    status: r.status,
    body: await r.text(),
    contentType: r.headers.get('content-type') ?? 'application/json',
  }
}

async function scrapeNextData(path: string): Promise<unknown> {
  const r = await fetch(`${SC_WEB}${path}`, {
    headers: { ...BROWSER_HEADERS, Accept: 'text/html' },
  })
  const html = await r.text()

  const match = html.match(/<script\s+id="__NEXT_DATA__"[^>]*>([\s\S]*?)<\/script>/)
  if (match?.[1]) return JSON.parse(match[1])

  const rscChunks: unknown[] = []
  const rscPattern = /\d+:(\[[\s\S]*?\])\n/g
  let rscMatch: RegExpExecArray | null
  while ((rscMatch = rscPattern.exec(html)) !== null) {
    try { rscChunks.push(JSON.parse(rscMatch[1])) } catch { /* skip */ }
  }
  if (rscChunks.length > 0) return { rscChunks }

  return null
}

export default async function handler(req: VercelRequest, res: VercelResponse) {
  const method = (req.method ?? 'GET').toUpperCase()
  if (method !== 'GET') {
    sendJson(res, 405, { error: 'Method not allowed' })
    return
  }

  const rawOp = req.query.op
  const op = (Array.isArray(rawOp) ? rawOp[0] : rawOp) ?? 'health'

  try {
    if (op === 'health') {
      const data = await proxyApi('/health')
      res.status(data.status)
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
      const rawUsername = req.query.username
      const username = Array.isArray(rawUsername) ? rawUsername[0] : rawUsername
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
      const rawPath = req.query.path
      const path = (Array.isArray(rawPath) ? rawPath[0] : rawPath) ?? '/'
      const data = await proxyApi(path)
      res.status(data.status)
      res.setHeader('Content-Type', data.contentType)
      res.setHeader('Cache-Control', 'private, no-store')
      res.setHeader('Access-Control-Allow-Origin', '*')
      res.end(data.body)
      return
    }

    if (op === 'pages') {
      const pages = [
        '/', '/about', '/terms', '/help', '/disclosure',
        '/earnings-and-payouts', '/privacy-policy', '/content-monitor-policy',
        '/complaints-policy', '/earnings',
      ]
      const results: Record<string, { status: number; title: string; excerpt: string }> = {}
      await Promise.all(
        pages.map(async (p) => {
          try {
            const r = await fetch(`${SC_WEB}${p}`, {
              headers: { ...BROWSER_HEADERS, Accept: 'text/html' },
            })
            const html = await r.text()
            const titleMatch = html.match(/<title[^>]*>([^<]*)<\/title>/)
            const bodyText = html
              .replace(/<script[^>]*>[\s\S]*?<\/script>/gi, '')
              .replace(/<style[^>]*>[\s\S]*?<\/style>/gi, '')
              .replace(/<[^>]+>/g, ' ')
              .replace(/\s+/g, ' ')
              .trim()
            results[p] = {
              status: r.status,
              title: titleMatch?.[1] ?? '',
              excerpt: bodyText.slice(0, 600),
            }
          } catch {
            results[p] = { status: 0, title: 'error', excerpt: '' }
          }
        }),
      )
      sendJson(res, 200, results)
      return
    }

    if (op === 'earnings') {
      const r = await fetch(`${SC_WEB}/earnings`, {
        headers: { ...BROWSER_HEADERS, Accept: 'text/html' },
      })
      const html = await r.text()
      const bodyText = html
        .replace(/<script[^>]*>[\s\S]*?<\/script>/gi, '')
        .replace(/<style[^>]*>[\s\S]*?<\/style>/gi, '')
        .replace(/<[^>]+>/g, '\n')
        .replace(/\n{3,}/g, '\n\n')
        .replace(/[ \t]+/g, ' ')
        .trim()
      sendJson(res, 200, { status: r.status, text: bodyText.slice(0, 3000) })
      return
    }

    sendJson(res, 400, { error: `unknown op: ${op}` })
  } catch (error: unknown) {
    sendJson(res, 502, {
      error: 'sc proxy failed',
      detail: error instanceof Error ? error.message : String(error),
    })
  }
}
