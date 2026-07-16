const WET3_ORIGIN = 'https://wet3.click'

const ALLOWED_HOST_SUFFIXES = [
  '.b-cdn.net',
  '.allaccessfans.co',
  '.wasabisys.com',
  '.contabostorage.com',
] as const

const ALLOWED_HOSTS = new Set([
  'wet3.click',
  'www.wet3.click',
  'media.allaccessfans.co',
  's3.eu-west-1.wasabisys.com',
])

export function isAllowedHlsUrl(raw: string): boolean {
  try {
    const url = new URL(raw)
    if (url.protocol !== 'https:') {
      return false
    }

    if (ALLOWED_HOSTS.has(url.hostname)) {
      return true
    }

    return ALLOWED_HOST_SUFFIXES.some((suffix) => url.hostname.endsWith(suffix))
  } catch {
    return false
  }
}

export function hlsProxyPath(targetUrl: string): string {
  return `/api/hls-proxy?url=${encodeURIComponent(targetUrl)}`
}

/** Rewrite Location from stream-v2 into a same-origin HLS proxy URL when needed. */
export function rewriteStreamLocation(location: string): string {
  const absolute = location.startsWith('http')
    ? location
    : new URL(location, WET3_ORIGIN).href

  if (absolute.startsWith(`${WET3_ORIGIN}/`)) {
    return `/wet3-api/${absolute.slice(`${WET3_ORIGIN}/`.length)}`
  }

  if (isAllowedHlsUrl(absolute) && !absolute.includes('/wet3-api/')) {
    // Bunny (and similar) require Referer: wet3.click — browser origin can't satisfy that.
    return hlsProxyPath(absolute)
  }

  if (location.startsWith('/')) {
    return `/wet3-api${location}`
  }

  return location
}

function proxyAbsoluteUrl(targetUrl: string, playlistUrl: string): string {
  const absolute = new URL(targetUrl, playlistUrl).href
  return hlsProxyPath(absolute)
}

export function rewritePlaylistBody(playlistText: string, playlistUrl: string): string {
  return playlistText
    .split('\n')
    .map((line) => {
      const trimmed = line.trim()

      if (!trimmed) {
        return line
      }

      if (trimmed.startsWith('#')) {
        return line.replace(/URI="([^"]+)"/gi, (_match, uri: string) => {
          return `URI="${proxyAbsoluteUrl(uri, playlistUrl)}"`
        })
      }

      return proxyAbsoluteUrl(trimmed, playlistUrl)
    })
    .join('\n')
}

export function wet3FetchHeaders(extra: Record<string, string> = {}): Record<string, string> {
  return {
    'User-Agent':
      'Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/131.0.0.0 Safari/537.36',
    Accept: '*/*',
    // Bunny Referer gate + wet3 now 403s stream-v2 when Referer is wetaccess.
    Referer: `${WET3_ORIGIN}/`,
    Origin: WET3_ORIGIN,
    ...extra,
  }
}

export async function fetchProxiedMedia(targetUrl: string): Promise<{
  status: number
  contentType: string | null
  body: Buffer
  finalUrl: string
}> {
  if (!isAllowedHlsUrl(targetUrl)) {
    return {
      status: 400,
      contentType: 'application/json',
      body: Buffer.from(JSON.stringify({ error: 'url host not allowed' })),
      finalUrl: targetUrl,
    }
  }

  const response = await fetch(targetUrl, {
    redirect: 'follow',
    headers: wet3FetchHeaders(),
  })

  const contentType = response.headers.get('content-type')
  const buffer = Buffer.from(await response.arrayBuffer())
  const finalUrl = response.url || targetUrl

  const looksLikePlaylist =
    (contentType ?? '').includes('mpegurl') ||
    (contentType ?? '').includes('m3u8') ||
    buffer.subarray(0, 7).toString('utf8').startsWith('#EXTM3U')

  if (looksLikePlaylist) {
    const rewritten = rewritePlaylistBody(buffer.toString('utf8'), finalUrl)
    return {
      status: response.status,
      contentType: 'application/vnd.apple.mpegurl',
      body: Buffer.from(rewritten),
      finalUrl,
    }
  }

  return {
    status: response.status,
    contentType,
    body: buffer,
    finalUrl,
  }
}
