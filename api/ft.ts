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

const CONVEX = 'https://zealous-perch-126.convex.cloud'
const STREAM_CDN = 'https://vz-d849a0bc-fed.b-cdn.net'
const STREAM_LIBRARY = '494644'
const GUID_RE = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i
const UA =
  'Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/131.0.0.0 Safari/537.36'

function q(value: string | string[] | undefined): string | undefined {
  if (Array.isArray(value)) return value[0]
  return value
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

export default async function handler(req: VercelRequest, res: VercelResponse) {
  if (req.method && req.method !== 'GET') {
    res.status(405)
    res.setHeader('Content-Type', 'application/json')
    res.end(JSON.stringify({ error: 'Method not allowed' }))
    return
  }

  const op = q(req.query.op) ?? 'posts'

  try {
    let body: unknown
    if (op === 'posts') {
      body = await convexQuery('posts:getAllPosts', {})
    } else if (op === 'profile') {
      const username = (q(req.query.username) ?? '').trim()
      if (!username) {
        res.status(400)
        res.setHeader('Content-Type', 'application/json')
        res.end(JSON.stringify({ error: 'missing username' }))
        return
      }
      body = await convexQuery('users:getUserProfile', { username })
    } else if (op === 'post') {
      const id = (q(req.query.id) ?? '').trim()
      if (!id) {
        res.status(400)
        res.setHeader('Content-Type', 'application/json')
        res.end(JSON.stringify({ error: 'missing id' }))
        return
      }
      body = await convexQuery('posts:getPost', { postId: id })
    } else if (op === 'stream') {
      const guid = (q(req.query.guid) ?? '').trim()
      const file = (q(req.query.file) ?? 'play_720p.mp4').replace(
        /[^a-zA-Z0-9._/-]/g,
        '',
      )
      if (!GUID_RE.test(guid) || !file || file.includes('..')) {
        res.status(400)
        res.setHeader('Content-Type', 'application/json')
        res.end(JSON.stringify({ error: 'invalid guid or file' }))
        return
      }
      const target = `${STREAM_CDN}/${guid}/${file}`
      const referer = `https://iframe.mediadelivery.net/embed/${STREAM_LIBRARY}/${guid}`
      const upstream = await fetch(target, {
        headers: {
          'User-Agent': UA,
          Referer: referer,
          Origin: 'https://iframe.mediadelivery.net',
        },
      })
      const buf = Buffer.from(await upstream.arrayBuffer())
      const ctype = upstream.headers.get('content-type')
      if (ctype) res.setHeader('Content-Type', ctype)
      res.setHeader('Cache-Control', 'private, max-age=300')
      res.setHeader('Access-Control-Allow-Origin', '*')
      res.status(upstream.status).end(buf)
      return
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
    res.status(502).end(
      JSON.stringify({
        error: err instanceof Error ? err.message : String(err),
      }),
    )
  }
}
