import { fetchFeedPage } from './_lib/feedCore'

type VercelRequest = {
  method?: string
  query: Record<string, string | string[] | undefined>
}

type VercelResponse = {
  status: (code: number) => VercelResponse
  setHeader: (name: string, value: string) => void
  json: (body: unknown) => void
  end: (body?: string) => void
}

export const config = {
  maxDuration: 30,
}

export default async function handler(req: VercelRequest, res: VercelResponse) {
  if ((req.method ?? 'GET').toUpperCase() !== 'GET') {
    res.status(405).json({ error: 'method not allowed' })
    return
  }

  const pageRaw = Array.isArray(req.query.page) ? req.query.page[0] : req.query.page
  const page = Math.max(1, Number.parseInt(pageRaw ?? '1', 10) || 1)

  try {
    const result = await fetchFeedPage(page)
    res.status(200)
    res.setHeader('cache-control', 'public, s-maxage=30, stale-while-revalidate=120')
    res.setHeader('content-type', 'application/json; charset=utf-8')
    res.end(JSON.stringify({ success: true, ...result }))
  } catch (error) {
    res.status(502).json({
      error: 'feed failed',
      detail: error instanceof Error ? error.message : String(error),
    })
  }
}
