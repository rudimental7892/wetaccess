import https from 'node:https'

type VercelRequest = {
  method?: string
  query: Record<string, string | string[] | undefined>
  url?: string
}

type VercelResponse = {
  status: (code: number) => VercelResponse
  setHeader: (name: string, value: string) => void
  end: (body?: string) => void
}

export const config = {
  maxDuration: 60,
}

const FB_API = 'https://fb-services.fanbusy.com:9105/api/v1'
const UA =
  'Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/131.0.0.0 Safari/537.36'

const agent = new https.Agent({ rejectUnauthorized: false })

function q(value: string | string[] | undefined): string | undefined {
  if (Array.isArray(value)) return value[0]
  return value
}

/** Allow only relative api/v1 paths — no open proxy. */
function sanitizePath(raw: string): string | null {
  const cleaned = raw.replace(/^\/+/, '').replace(/\.\./g, '')
  if (!cleaned || cleaned.includes('://')) return null
  return cleaned
}

function httpsGet(url: string, headers: Record<string, string>): Promise<{ status: number; body: string }> {
  return new Promise((resolve, reject) => {
    const parsed = new URL(url)
    const req = https.request(
      {
        hostname: parsed.hostname,
        port: parsed.port || 443,
        path: parsed.pathname + parsed.search,
        method: 'GET',
        headers,
        agent,
      },
      (res) => {
        const chunks: Buffer[] = []
        res.on('data', (chunk: Buffer) => chunks.push(chunk))
        res.on('end', () => {
          resolve({ status: res.statusCode ?? 502, body: Buffer.concat(chunks).toString() })
        })
      },
    )
    req.on('error', reject)
    req.end()
  })
}

export default async function handler(req: VercelRequest, res: VercelResponse) {
  if (req.method && req.method !== 'GET' && req.method !== 'POST') {
    res.status(405)
    res.setHeader('Content-Type', 'application/json')
    res.end(JSON.stringify({ error: 'Method not allowed' }))
    return
  }

  const path = sanitizePath(q(req.query.path) ?? '')
  if (!path) {
    res.status(400)
    res.setHeader('Content-Type', 'application/json')
    res.end(JSON.stringify({ error: 'missing or invalid path' }))
    return
  }

  const incoming = new URL(req.url ?? '/', 'http://localhost')
  incoming.searchParams.delete('path')
  const search = incoming.searchParams.toString()
  const target = `${FB_API}/${path}${search ? `?${search}` : ''}`

  try {
    const upstream = await httpsGet(target, {
      'User-Agent': UA,
      Accept: 'application/json',
      Origin: 'https://www.fanbusy.com',
      Referer: 'https://www.fanbusy.com/',
    })
    res.setHeader('Content-Type', 'application/json')
    res.setHeader('Cache-Control', 'private, no-store')
    res.setHeader('Access-Control-Allow-Origin', '*')
    res.status(upstream.status).end(upstream.body)
  } catch (err) {
    res.setHeader('Content-Type', 'application/json')
    res.status(502).end(
      JSON.stringify({
        error: err instanceof Error ? err.message : String(err),
      }),
    )
  }
}
