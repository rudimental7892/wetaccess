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

const WET3_ORIGIN = 'https://wet3.click'

function isAllowedHlsUrl(raw: string): boolean {
  try {
    const url = new URL(raw)
    if (url.protocol !== 'https:') return false
    const host = url.hostname
    return (
      host.endsWith('.b-cdn.net') ||
      host.endsWith('.allaccessfans.co') ||
      host === 'media.allaccessfans.co' ||
      host === 'wet3.click' ||
      host === 'www.wet3.click'
    )
  } catch {
    return false
  }
}

function proxyPath(targetUrl: string): string {
  return `/api/hls-proxy?url=${encodeURIComponent(targetUrl)}`
}

function rewritePlaylist(playlistText: string, playlistUrl: string): string {
  return playlistText
    .split('\n')
    .map((line) => {
      const trimmed = line.trim()
      if (!trimmed) return line
      if (trimmed.startsWith('#')) {
        return line.replace(/URI="([^"]+)"/gi, (_m, uri: string) => {
          return `URI="${proxyPath(new URL(uri, playlistUrl).href)}"`
        })
      }
      return proxyPath(new URL(trimmed, playlistUrl).href)
    })
    .join('\n')
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
    const upstream = await fetch(decoded, {
      redirect: 'follow',
      headers: {
        'User-Agent':
          'Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/131.0.0.0 Safari/537.36',
        Accept: '*/*',
        Referer: `${WET3_ORIGIN}/`,
        Origin: WET3_ORIGIN,
      },
    })

    const contentType = upstream.headers.get('content-type')
    const buffer = Buffer.from(await upstream.arrayBuffer())
    const finalUrl = upstream.url || decoded
    const textHead = buffer.subarray(0, 7).toString('utf8')
    const looksLikePlaylist =
      (contentType ?? '').includes('mpegurl') ||
      (contentType ?? '').includes('m3u8') ||
      textHead.startsWith('#EXTM3U')

    res.status(upstream.status)
    res.setHeader('cache-control', 'private, no-store')
    res.setHeader('access-control-allow-origin', '*')

    if (looksLikePlaylist) {
      res.setHeader('content-type', 'application/vnd.apple.mpegurl')
      res.end(Buffer.from(rewritePlaylist(buffer.toString('utf8'), finalUrl)))
      return
    }

    if (contentType) {
      res.setHeader('content-type', contentType)
    }
    res.end(buffer)
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
