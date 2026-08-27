// Vercel ESM requires explicit .js extension for relative imports at runtime.
import { fetchProxiedMedia } from './_lib/hlsProxyCore.js'

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

  if (!targetUrl || targetUrl.trim() === '') {
    res.status(400)
    res.setHeader('content-type', 'application/json')
    res.end(JSON.stringify({ error: 'missing url', detail: 'hls-proxy url= was empty (open proxied stream had no playUrl)' }))
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

  const result = await fetchProxiedMedia(decoded)
  const isImage = result.contentType?.startsWith('image/') ?? false

  res.status(result.status)
  if (result.contentType) {
    res.setHeader('content-type', result.contentType)
  }
  res.setHeader('cache-control', isImage ? 'public, max-age=1800' : 'private, no-store')
  res.setHeader('access-control-allow-origin', '*')
  res.end(result.body)
}
