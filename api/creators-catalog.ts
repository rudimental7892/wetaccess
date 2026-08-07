import { fetchCreatorsFromWet3 } from './_lib/creatorsCore'

type VercelRequest = {
  method?: string
  query: Record<string, string | string[] | undefined>
}

type VercelResponse = {
  status: (code: number) => VercelResponse
  setHeader: (name: string, value: string) => void
  end: (body?: string) => void
}

function q(value: string | string[] | undefined): string | undefined {
  if (Array.isArray(value)) return value[0]
  return value
}

export default async function handler(req: VercelRequest, res: VercelResponse) {
  if ((req.method ?? 'GET').toUpperCase() !== 'GET') {
    res.status(405)
    res.setHeader('Content-Type', 'application/json')
    res.end(JSON.stringify({ error: 'Method not allowed' }))
    return
  }

  try {
    const page = Number.parseInt(q(req.query.page) ?? '1', 10) || 1
    const limit = Number.parseInt(q(req.query.limit) ?? '24', 10) || 24
    const search = q(req.query.search)
    const twitterOnly = q(req.query.twitterOnly) === 'true'

    const data = await fetchCreatorsFromWet3({ page, limit, search, twitterOnly })
    res.status(200)
    res.setHeader('Content-Type', 'application/json; charset=utf-8')
    res.setHeader('Cache-Control', 'private, max-age=30')
    res.end(JSON.stringify(data))
  } catch (error: unknown) {
    res.status(502)
    res.setHeader('Content-Type', 'application/json')
    res.end(
      JSON.stringify({
        error: 'creators catalog failed',
        detail: error instanceof Error ? error.message : String(error),
        items: [],
        total: 0,
        page: 1,
        limit: 24,
      }),
    )
  }
}
