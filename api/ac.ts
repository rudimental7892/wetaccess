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

function q(value: string | string[] | undefined, fallback = ''): string {
  if (Array.isArray(value)) return value[0] ?? fallback
  return value ?? fallback
}

function extractMp4(html: string): string | null {
  const m = html.match(/src="(https:\/\/[^"]+\.mp4[^"]*)"/i)
  return m?.[1]?.replace(/&amp;/g, '&') ?? null
}

async function handleCatalog(req: VercelRequest, res: VercelResponse) {
  const offset = q(req.query.offset, '0')
  const amount = q(req.query.amount, '100')
  const upstream = `${MEMBERS}/api/?output=json&command=media.newest&type=videos&offset=${encodeURIComponent(offset)}&amount=${encodeURIComponent(amount)}`

  const response = await fetch(upstream, {
    headers: { 'User-Agent': UA, Accept: 'application/json', Referer: `${MEMBERS}/` },
  })
  const text = await response.text()
  res.setHeader('Content-Type', 'application/json')
  res.setHeader('Cache-Control', 'no-store')
  res.status(response.ok ? 200 : 502).end(
    response.ok ? text : JSON.stringify({ error: `Upstream ${response.status}`, body: text.slice(0, 400) }),
  )
}

async function handleEmbed(req: VercelRequest, res: VercelResponse) {
  const id = q(req.query.id)
  if (!id || !/^\d+$/.test(id)) {
    res.setHeader('Content-Type', 'application/json')
    res.status(400).end(JSON.stringify({ error: 'Missing or invalid id' }))
    return
  }

  const response = await fetch(`${MEMBERS}/embed/${id}`, {
    headers: { 'User-Agent': UA, Accept: 'text/html', Referer: `${MEMBERS}/` },
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
}

export default async function handler(req: VercelRequest, res: VercelResponse) {
  if (req.method && req.method !== 'GET') {
    res.status(405).end(JSON.stringify({ error: 'Method not allowed' }))
    return
  }

  const op = q(req.query.op, 'catalog')

  try {
    if (op === 'embed') {
      await handleEmbed(req, res)
    } else {
      await handleCatalog(req, res)
    }
  } catch (err) {
    res.setHeader('Content-Type', 'application/json')
    res.status(502).end(
      JSON.stringify({ error: err instanceof Error ? err.message : String(err) }),
    )
  }
}
