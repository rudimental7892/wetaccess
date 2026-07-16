import { fetchProxiedMedia, isAllowedHlsUrl } from './_lib/hlsProxyCore'

type VercelRequest = {
  query: {
    url?: string | string[]
  }
}

type VercelResponse = {
  status: (code: number) => VercelResponse
  setHeader: (name: string, value: string | number) => void
  end: (body?: string | Buffer) => void
}

export const config = {
  maxDuration: 30,
}

export default async function handler(req: VercelRequest, res: VercelResponse) {
  const raw = req.query.url
  const targetUrl = Array.isArray(raw) ? raw[0] : raw

  if (!targetUrl) {
    res.status(400)
    res.setHeader('content-type', 'application/json')
    res.end(JSON.stringify({ error: 'missing url' }))
    return
  }

  let decoded: string
  try {
    decoded = decodeURIComponent(targetUrl)
  } catch {
    res.status(400)
    res.setHeader('content-type', 'application/json')
    res.end(JSON.stringify({ error: 'invalid url encoding' }))
    return
  }

  if (!isAllowedHlsUrl(decoded)) {
    res.status(400)
    res.setHeader('content-type', 'application/json')
    res.end(JSON.stringify({ error: 'url host not allowed' }))
    return
  }

  try {
    const upstream = await fetchProxiedMedia(decoded)
    res.status(upstream.status)
    if (upstream.contentType) {
      res.setHeader('content-type', upstream.contentType)
    }
    res.setHeader('cache-control', 'private, no-store')
    res.setHeader('access-control-allow-origin', '*')
    res.end(upstream.body)
  } catch (error) {
    res.status(502)
    res.setHeader('content-type', 'application/json')
    res.end(
      JSON.stringify({
        error: 'hls proxy failed',
        detail: error instanceof Error ? error.message : String(error),
      }),
    )
  }
}
