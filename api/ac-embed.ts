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

function q(value: string | string[] | undefined): string | undefined {
  if (Array.isArray(value)) return value[0]
  return value
}

function extractMp4(html: string): string | null {
  const m = html.match(/src="(https:\/\/[^"]+\.mp4[^"]*)"/i)
  return m?.[1]?.replace(/&amp;/g, '&') ?? null
}

export default async function handler(req: VercelRequest, res: VercelResponse) {
  if (req.method && req.method !== 'GET') {
    res.status(405).end(JSON.stringify({ error: 'Method not allowed' }))
    return
  }

  const id = q(req.query.id)
  if (!id || !/^\d+$/.test(id)) {
    res.setHeader('Content-Type', 'application/json')
    res.status(400).end(JSON.stringify({ error: 'Missing or invalid id' }))
    return
  }

  try {
    const response = await fetch(`${MEMBERS}/embed/${id}`, {
      headers: {
        'User-Agent': UA,
        Accept: 'text/html',
        Referer: `${MEMBERS}/`,
      },
    })
    const html = await response.text()
    if (!response.ok) {
      res.setHeader('Content-Type', 'application/json')
      res.status(502).end(JSON.stringify({ error: `Upstream ${response.status}`, id }))
      return
    }

    const mp4 = extractMp4(html)
    const poster = html.match(/poster="(https:\/\/[^"]+)"/i)?.[1] ?? null
    res.setHeader('Content-Type', 'application/json')
    res.setHeader('Cache-Control', 'no-store')
    if (!mp4) {
      res.status(404).end(JSON.stringify({ error: 'No MP4 in embed response', id }))
      return
    }
    res.status(200).end(JSON.stringify({ id, mp4, poster }))
  } catch (err) {
    res.setHeader('Content-Type', 'application/json')
    res.status(502).end(
      JSON.stringify({ error: err instanceof Error ? err.message : String(err) }),
    )
  }
}
