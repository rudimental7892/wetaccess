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
