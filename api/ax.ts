type VercelRequest = {
  method?: string
  query: Record<string, string | string[] | undefined>
  url?: string
}

type VercelResponse = {
  status: (code: number) => VercelResponse
  setHeader: (name: string, value: string) => void
  end: (body?: string | Buffer) => void
}

export const config = {
  maxDuration: 60,
}

const AXESSLY_API = 'https://api.axessly.co'
const TOKEN = 'VHlkZRba4kIgiHUVV1QJ6Ox0KzovyLsw'
const UA =
  'Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/131.0.0.0 Safari/537.36'

function q(value: string | string[] | undefined): string | undefined {
  if (Array.isArray(value)) return value[0]
  return value
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

export default async function handler(
  req: VercelRequest,
  res: VercelResponse,
) {
  if (req.method && req.method !== 'GET') {
    res.status(405)
    res.setHeader('Content-Type', 'application/json')
    res.end(JSON.stringify({ error: 'Method not allowed' }))
    return
  }

  const op = q(req.query.op) ?? 'creators'

  try {
    let body: unknown
    if (op === 'creators') {
      const limit = q(req.query.limit) ?? '100'
      body = await axFetch(`/api/explore/creators?limit=${limit}`)
    } else if (op === 'posts') {
      const username = (q(req.query.username) ?? '').trim()
      if (!username) {
        res.status(400)
        res.setHeader('Content-Type', 'application/json')
        res.end(JSON.stringify({ error: 'missing username' }))
        return
      }
      body = await axFetch(
        `/api/posts/user/${encodeURIComponent(username)}`,
      )
    } else if (op === 'feed') {
      const limit = q(req.query.limit) ?? '50'
      body = await axFetch(`/api/feed?limit=${limit}`)
    } else if (op === 'reels') {
      const limit = q(req.query.limit) ?? '50'
      body = await axFetch(`/api/posts/reels?limit=${limit}`)
    } else {
      res.status(400)
      res.setHeader('Content-Type', 'application/json')
      res.end(JSON.stringify({ error: 'unknown op' }))
      return
    }

    res.setHeader('Content-Type', 'application/json')
    res.setHeader('Cache-Control', 'private, no-store')
    res.setHeader('Access-Control-Allow-Origin', '*')
    res.status(200).end(JSON.stringify(body))
  } catch (err) {
    res.setHeader('Content-Type', 'application/json')
    res
      .status(502)
      .end(
        JSON.stringify({
          error: err instanceof Error ? err.message : String(err),
        }),
      )
  }
}
