import {
  fetchLzCreators,
  fetchLzProfile,
  fetchLzStream,
} from './_lib/leakedzoneCore.js'

type VercelRequest = {
  method?: string
  query: Record<string, string | string[] | undefined>
}

type VercelResponse = {
  status: (code: number) => VercelResponse
  setHeader: (name: string, value: string) => void
  end: (body?: string | Buffer) => void
}

export const config = {
  maxDuration: 60,
}

function q(value: string | string[] | undefined): string | undefined {
  if (Array.isArray(value)) return value[0]
  return value
}

export default async function handler(req: VercelRequest, res: VercelResponse) {
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
      const page = Number.parseInt(q(req.query.page) ?? '1', 10)
      body = await fetchLzCreators({
        page: Number.isFinite(page) ? page : 1,
        networks: q(req.query.networks) || undefined,
        sort: q(req.query.sort) || undefined,
      })
    } else if (op === 'profile') {
      const slug = (q(req.query.slug) ?? '').trim()
      if (!slug) {
        res.status(400)
        res.setHeader('Content-Type', 'application/json')
        res.end(JSON.stringify({ error: 'missing slug' }))
        return
      }
      const tabRaw = q(req.query.tab) ?? 'video'
      const tab = tabRaw === 'photo' ? 'photo' : 'video'
      const page = Number.parseInt(q(req.query.page) ?? '1', 10)
      body = await fetchLzProfile({
        slug,
        tab,
        page: Number.isFinite(page) ? page : 1,
        sort: q(req.query.sort) || 'newest',
      })
    } else if (op === 'stream') {
      const slug = (q(req.query.slug) ?? '').trim()
      const id = (q(req.query.id) ?? '').trim()
      if (!slug || !id) {
        res.status(400)
        res.setHeader('Content-Type', 'application/json')
        res.end(JSON.stringify({ error: 'missing slug or id' }))
        return
      }
      body = await fetchLzStream(slug, id)
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
