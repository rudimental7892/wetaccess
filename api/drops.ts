import { fetchSlimDrops } from './_lib/dropsCore'

type VercelRequest = {
  method?: string
}

type VercelResponse = {
  status: (code: number) => VercelResponse
  setHeader: (name: string, value: string) => void
  json: (body: unknown) => void
  end: (body?: string) => void
}

export const config = {
  maxDuration: 60,
  api: {
    responseLimit: false,
  },
}

export default async function handler(req: VercelRequest, res: VercelResponse) {
  if ((req.method ?? 'GET').toUpperCase() !== 'GET') {
    res.status(405).json({ error: 'method not allowed' })
    return
  }

  try {
    const drops = await fetchSlimDrops()
    res.status(200)
    res.setHeader('cache-control', 'public, s-maxage=30, stale-while-revalidate=120')
    res.setHeader('content-type', 'application/json; charset=utf-8')
    res.end(JSON.stringify({ success: true, drops }))
  } catch (error) {
    res.status(502).json({
      error: 'drops catalog failed',
      detail: error instanceof Error ? error.message : String(error),
    })
  }
}
