const WET3_ORIGIN = 'https://wet3.click'
const AAF_ORIGIN = 'https://allaccessfans.co'
const LZ_ORIGIN = 'https://leakedzone.com'

const ALLOWED_HOST_SUFFIXES = [
  '.b-cdn.net',
  '.allaccessfans.co',
  '.wasabisys.com',
  '.contabostorage.com',
] as const

const ALLOWED_HOSTS = new Set([
  'wet3.click',
  'www.wet3.click',
  'wet3.site',
  'www.wet3.site',
  'media.allaccessfans.co',
  's3.eu-west-1.wasabisys.com',
  'leakedzone.com',
  'www.leakedzone.com',
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

/**
 * wet3 stream-v2 maps AAF stills to a non-existent
 * `/streaming/image/.../file.jpg.m3u8` playlist. The real asset is
 * `/image/.../file.jpg` and requires an AllAccessFans Referer.
 */
export function aafStillUrlFromFakeHls(nested: string): string | null {
  try {
    const url = new URL(nested)
    if (!url.hostname.endsWith('allaccessfans.co')) {
      return null
    }

    if (!url.pathname.includes('/streaming/image/')) {
      return null
    }

    if (!/\.(jpe?g|png|gif|webp)\.m3u8$/i.test(url.pathname)) {
      return null
    }

    url.pathname = url.pathname
      .replace('/streaming/image/', '/image/')
      .replace(/\.m3u8$/i, '')
    return url.href
  } catch {
    return null
  }
}

/** CloudFront `Expires=` from wet3-signed AAF URLs (unix seconds). */
export function cloudFrontExpiryUnix(rawUrl: string): number | null {
  try {
    const value = new URL(rawUrl).searchParams.get('Expires')
    if (!value) {
      return null
    }
    const expires = Number.parseInt(value, 10)
    return Number.isFinite(expires) ? expires : null
  } catch {
    return null
  }
}

export function isCloudFrontUrlExpired(rawUrl: string, skewSeconds = 30): boolean {
  const expires = cloudFrontExpiryUnix(rawUrl)
  if (expires == null) {
    return false
  }
  return expires <= Math.floor(Date.now() / 1000) - skewSeconds
}

/**
 * Resolve wet3's `/api/stream-v2/proxy-m3u8?url=` (and older proxy paths) to a
 * same-origin playable URL, or null if the nested target cannot be salvaged.
 */
export function resolveWet3ProxyNestedUrl(nested: string): string | null {
  try {
    const still = aafStillUrlFromFakeHls(nested)
    if (still) {
      return hlsProxyPath(still)
    }

    const nestedUrl = new URL(nested)
    if (nestedUrl.hostname.endsWith('.b-cdn.net')) {
      return hlsProxyPath(nested)
    }

    // Direct JPEG/PNG stills now come through proxy-m3u8 without the fake .m3u8 path.
    if (
      nestedUrl.hostname.endsWith('allaccessfans.co') &&
      /\.(jpe?g|png|gif|webp)$/i.test(nestedUrl.pathname)
    ) {
      return hlsProxyPath(nested)
    }

    // AAF HLS: wet3's broker is currently Proxy Error; try CDN via our proxy when
    // the signature is still fresh. Expired signatures cannot be repaired here.
    if (nestedUrl.hostname.endsWith('allaccessfans.co')) {
      if (isCloudFrontUrlExpired(nested)) {
        return null
      }
      return hlsProxyPath(nested)
    }
  } catch {
    return null
  }

  return null
}

/** Rewrite Location from stream-v2 into a same-origin HLS proxy URL when needed. */
export function rewriteStreamLocation(location: string): string {
  const absolute = location.startsWith('http')
    ? location
    : new URL(location, WET3_ORIGIN).href

  let isWet3Host = false
  try {
    const parsed = new URL(absolute)
    // Allow any wet3 subdomain (fyolot.wet3.click etc. from wet3.site rotation)
    isWet3Host =
      parsed.hostname === 'wet3.click' ||
      parsed.hostname === 'www.wet3.click' ||
      parsed.hostname === 'wet3.site' ||
      parsed.hostname === 'www.wet3.site' ||
      parsed.hostname.endsWith('.wet3.click') ||
      parsed.hostname.endsWith('.wet3.site')

    if (parsed.hostname.endsWith('.b-cdn.net')) {
      return hlsProxyPath(absolute)
    }

    // Matches proxy, proxy.m3u8, and the current proxy-m3u8 broker path.
    if (parsed.pathname.includes('/api/stream-v2/proxy')) {
      const nested = parsed.searchParams.get('url')
      if (nested) {
        const resolved = resolveWet3ProxyNestedUrl(nested)
        if (resolved) {
          return resolved
        }
        // Expired / unsalvageable AAF URL — keep a wet3-api hop so the player
        // can read wet3's "Proxy Error" / our clearer middleware JSON.
      }
      if (isWet3Host) {
        // Handles fyolot.wet3.click etc.
        const withoutOrigin = absolute.replace(/^https:\/\/[^/]+/, '')
        return `/wet3-api${withoutOrigin}`
      }
      if (absolute.startsWith(`${WET3_ORIGIN}/`)) {
        return `/wet3-api/${absolute.slice(`${WET3_ORIGIN}/`.length)}`
      }
      if (location.startsWith('/')) {
        return `/wet3-api${location}`
      }
    }
  } catch {
    // fall through
  }

  if (isWet3Host || absolute.startsWith(`${WET3_ORIGIN}/`)) {
    const withoutOrigin = absolute.replace(/^https:\/\/[^/]+/, '')
    return `/wet3-api${withoutOrigin.startsWith('/') ? withoutOrigin : `/${withoutOrigin}`}`
  }

  if (isAllowedHlsUrl(absolute) && absolute.includes('.b-cdn.net')) {
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

/** Pick CDN-appropriate Referer (AAF stills/videos 401 under wet3 Referer). */
export function fetchHeadersForTarget(
  targetUrl: string,
  extra: Record<string, string> = {},
): Record<string, string> {
  try {
    const host = new URL(targetUrl).hostname
    if (host.endsWith('allaccessfans.co')) {
      return wet3FetchHeaders({
        Referer: `${AAF_ORIGIN}/`,
        Origin: AAF_ORIGIN,
        ...extra,
      })
    }
    if (host === 'leakedzone.com' || host === 'www.leakedzone.com') {
      return wet3FetchHeaders({
        Referer: `${LZ_ORIGIN}/`,
        Origin: LZ_ORIGIN,
        ...extra,
      })
    }
  } catch {
    // fall through
  }

  return wet3FetchHeaders(extra)
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

  let lastError: unknown
  const maxAttempts = 3

  for (let attempt = 0; attempt < maxAttempts; attempt += 1) {
    try {
      const response = await fetch(targetUrl, {
        redirect: 'follow',
        headers: fetchHeadersForTarget(targetUrl),
      })

      const contentType = response.headers.get('content-type')
      const buffer = Buffer.from(await response.arrayBuffer())
      const finalUrl = response.url || targetUrl

      // Retry transient CDN failures (timeouts sometimes surface as empty 5xx / network).
      if (response.status >= 500 && attempt < maxAttempts - 1) {
        await new Promise((r) => setTimeout(r, 250 * (attempt + 1)))
        continue
      }

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
    } catch (error) {
      lastError = error
      if (attempt < maxAttempts - 1) {
        await new Promise((r) => setTimeout(r, 300 * (attempt + 1)))
        continue
      }
    }
  }

  return {
    status: 502,
    contentType: 'application/json',
    body: Buffer.from(
      JSON.stringify({
        error: 'hls proxy failed',
        detail: lastError instanceof Error ? lastError.message : String(lastError ?? 'unknown'),
      }),
    ),
    finalUrl: targetUrl,
  }
}
