import { randomUUID } from 'node:crypto'

type VercelRequest = {
  query: {
    id?: string | string[]
  }
}

type VercelResponse = {
  status: (code: number) => VercelResponse
  setHeader: (name: string, value: string | number) => void
  end: (body?: string | Buffer) => void
  json: (body: unknown) => void
}

export const config = {
  maxDuration: 30,
}

const WET3_ORIGIN = 'https://wet3.click'
const AAF_ORIGIN = 'https://allaccessfans.co'
const GUEST_COOKIE = `wet3_user_id=${randomUUID()}`

type ForYouItem = {
  id: string
  streamUrl: string
}

type StreamTokenPayload = {
  u?: string
}

function wet3Headers(extra: Record<string, string> = {}): Record<string, string> {
  return {
    'User-Agent':
      'Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/131.0.0.0 Safari/537.36',
    Accept: '*/*',
    Cookie: GUEST_COOKIE,
    Referer: `${WET3_ORIGIN}/`,
    Origin: WET3_ORIGIN,
    ...extra,
  }
}

function fetchHeadersFor(targetUrl: string): Record<string, string> {
  try {
    if (new URL(targetUrl).hostname.endsWith('allaccessfans.co')) {
      return wet3Headers({
        Referer: `${AAF_ORIGIN}/`,
        Origin: AAF_ORIGIN,
      })
    }
  } catch {
    // fall through
  }
  return wet3Headers()
}

function decodeStreamTokenPayload(token: string): StreamTokenPayload | null {
  try {
    const payloadPart = token.split('.')[0]
    if (!payloadPart) return null

    const padded = payloadPart
      .replace(/-/g, '+')
      .replace(/_/g, '/')
      .padEnd(Math.ceil(payloadPart.length / 4) * 4, '=')

    return JSON.parse(Buffer.from(padded, 'base64').toString('utf8')) as StreamTokenPayload
  } catch {
    return null
  }
}

function extractPlaylistUrlFromStreamPage(streamPageUrl: string): string | null {
  try {
    const url = new URL(streamPageUrl, WET3_ORIGIN)
    const token = url.searchParams.get('token')
    if (!token) return null

    const payload = decodeStreamTokenPayload(token)
    if (typeof payload?.u === 'string' && payload.u.includes('.m3u8')) {
      return payload.u
    }
    return null
  } catch {
    return null
  }
}

async function readPlaylistDuration(playlistUrl: string, depth = 0): Promise<number | null> {
  if (depth > 4) return null

  const response = await fetch(playlistUrl, {
    redirect: 'follow',
    headers: fetchHeadersFor(playlistUrl),
  })

  if (!response.ok) return null

  const playlistText = await response.text()
  if (!playlistText.includes('#EXTM3U')) return null

  const infMatches = [...playlistText.matchAll(/#EXTINF:([\d.]+)/g)]
  if (infMatches.length > 0) {
    const total = infMatches.reduce((sum, match) => sum + Number.parseFloat(match[1]), 0)
    return total > 0 ? total : null
  }

  const variantLine = playlistText
    .split('\n')
    .map((line) => line.trim())
    .find((line) => line && !line.startsWith('#'))

  if (variantLine?.includes('.m3u8') || variantLine?.includes('proxy.m3u8')) {
    return readPlaylistDuration(new URL(variantLine, response.url).href, depth + 1)
  }

  return null
}

async function resolveStreamPlaylistUrl(streamPageUrl: string): Promise<string | null> {
  const fromToken = extractPlaylistUrlFromStreamPage(streamPageUrl)
  if (fromToken) return fromToken

  let currentUrl = streamPageUrl

  for (let hop = 0; hop < 6; hop += 1) {
    const response = await fetch(currentUrl, {
      redirect: 'manual',
      headers: wet3Headers(),
    })

    if (response.status >= 300 && response.status < 400) {
      const location = response.headers.get('location')
      if (!location) return null

      currentUrl = new URL(location, currentUrl).href
      if (currentUrl.includes('.m3u8')) return currentUrl
      continue
    }

    if (!response.ok) return null

    const contentType = response.headers.get('content-type') ?? ''
    const body = await response.text()

    if (
      contentType.includes('mpegurl') ||
      contentType.includes('m3u8') ||
      body.startsWith('#EXTM3U')
    ) {
      return response.url || currentUrl
    }

    return null
  }

  return null
}

async function fetchStreamV2PlaylistUrl(mediaId: string): Promise<string | null> {
  const response = await fetch(`${WET3_ORIGIN}/api/stream-v2/${encodeURIComponent(mediaId)}`, {
    redirect: 'manual',
    headers: wet3Headers(),
  })

  if (response.status >= 300 && response.status < 400) {
    const location = response.headers.get('location')
    if (!location) return null
    return new URL(location, WET3_ORIGIN).href
  }

  if (response.ok) {
    const contentType = response.headers.get('content-type') ?? ''
    const body = await response.text()
    if (
      contentType.includes('mpegurl') ||
      contentType.includes('m3u8') ||
      body.startsWith('#EXTM3U')
    ) {
      return response.url
    }
  }

  return null
}

async function fetchForYouStreamUrl(mediaId: string): Promise<string | null> {
  const forYouResponse = await fetch(`${WET3_ORIGIN}/api/for-you`, {
    method: 'POST',
    headers: wet3Headers({ 'Content-Type': 'application/json' }),
    body: JSON.stringify({ startId: mediaId, limit: 24 }),
  })

  if (!forYouResponse.ok) return null

  const data = (await forYouResponse.json()) as { items?: ForYouItem[] }
  const item = data.items?.find((entry) => entry.id === mediaId)
  if (!item?.streamUrl) return null

  return item.streamUrl.startsWith('http')
    ? item.streamUrl
    : `${WET3_ORIGIN}${item.streamUrl}`
}

async function fetchWet3VideoDuration(mediaId: string): Promise<number | null> {
  const streamV2Playlist = await fetchStreamV2PlaylistUrl(mediaId)

  if (streamV2Playlist) {
    // Prefer direct CDN URL when wet3 wraps Bunny/AAF in proxy.m3u8.
    try {
      const parsed = new URL(streamV2Playlist)
      const nested = parsed.searchParams.get('url')
      if (nested && (nested.includes('.m3u8') || nested.includes('.b-cdn.net'))) {
        const direct = await readPlaylistDuration(nested)
        if (direct !== null) return direct
      }
    } catch {
      // fall through
    }

    const duration = await readPlaylistDuration(streamV2Playlist)
    if (duration !== null) return duration
  }

  const streamPageUrl = await fetchForYouStreamUrl(mediaId)
  if (!streamPageUrl) return null

  const playlistUrl = await resolveStreamPlaylistUrl(streamPageUrl)
  if (!playlistUrl) return null

  return readPlaylistDuration(playlistUrl)
}

export default async function handler(req: VercelRequest, res: VercelResponse) {
  const rawId = req.query.id
  const mediaId = Array.isArray(rawId) ? rawId[0] : rawId

  if (!mediaId) {
    res.status(400)
    res.setHeader('content-type', 'application/json')
    res.end(JSON.stringify({ duration: null }))
    return
  }

  try {
    const duration = await fetchWet3VideoDuration(mediaId)
    res.status(200)
    res.setHeader('content-type', 'application/json')
    res.setHeader('cache-control', 'public, max-age=300')
    res.end(JSON.stringify({ duration }))
  } catch {
    res.status(200)
    res.setHeader('content-type', 'application/json')
    res.end(JSON.stringify({ duration: null }))
  }
}
