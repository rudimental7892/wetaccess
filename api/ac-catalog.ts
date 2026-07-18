type VercelRequest = {
  method?: string
  query: Record<string, string | string[] | undefined>
}

type VercelResponse = {
  status: (code: number) => VercelResponse
  setHeader: (name: string, value: string) => void
  end: (body?: string) => void
}

export const config = {
  maxDuration: 60,
}

const MEMBERS = 'https://members.africancasting.com'
const UA =
  'Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/131.0.0.0 Safari/537.36'

function q(value: string | string[] | undefined, fallback: string): string {
  if (Array.isArray(value)) return value[0] ?? fallback
  return value ?? fallback
}

export default async function handler(req: VercelRequest, res: VercelResponse) {
  if (req.method && req.method !== 'GET') {
    res.status(405).end(JSON.stringify({ error: 'Method not allowed' }))
    return
  }

  const offset = q(req.query.offset, '0')
  const amount = q(req.query.amount, '100')
  const upstream = `${MEMBERS}/api/?output=json&command=media.newest&type=videos&offset=${encodeURIComponent(offset)}&amount=${encodeURIComponent(amount)}`

  try {
    const response = await fetch(upstream, {
      headers: {
        'User-Agent': UA,
        Accept: 'application/json',
        Referer: `${MEMBERS}/`,
      },
    })
    const text = await response.text()
    res.setHeader('Content-Type', 'application/json')
    res.setHeader('Cache-Control', 'no-store')
    res.status(response.ok ? 200 : 502).end(
      response.ok ? text : JSON.stringify({ error: `Upstream ${response.status}`, body: text.slice(0, 400) }),
    )
  } catch (err) {
    res.setHeader('Content-Type', 'application/json')
    res.status(502).end(
      JSON.stringify({ error: err instanceof Error ? err.message : String(err) }),
    )
  }
}
