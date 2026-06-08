export type MediaItem = {
  id: string
  media_type: '1' | '2'
  src: string
  path: string
  username: string
  webp_thumb: string | null
}

export type Creator = {
  u: string
  d: string
  ds: string
  rs: number
  p: string
  vn: string
  vi: string
}

export type CreatorsResponse = {
  items: Creator[]
  total: number
  page: number
  limit: number
}

const API_BASE = '/wet3-api'
const SITE_BASE = `${API_BASE}`
const WET3_ORIGIN = 'https://wet3.click'

const durationCache = new Map<string, number | null>()

export function streamUrl(mediaId: string): string {
  return `${WET3_ORIGIN}/api/stream-v2/${mediaId}`
}

export function imageUrl(mediaId: string): string {
  return `${SITE_BASE}/api/image/${mediaId}`
}

export function mediaLabel(item: MediaItem): string {
  const filename = item.path.split('/').pop()?.split('?')[0]

  if (filename) {
    return filename
  }

  return item.id
}

export function thumbnailUrl(item: MediaItem): string {
  if (item.webp_thumb) {
    if (item.webp_thumb.startsWith('http')) {
      return item.webp_thumb
    }

    return `${SITE_BASE}${item.webp_thumb}`
  }

  if (item.path.match(/\.(jpe?g|png|webp|gif)$/i)) {
    return item.path
  }

  return `${SITE_BASE}/api/image/${item.id}`
}

export function placeholderImage(): string {
  return `${SITE_BASE}/blog-placeholder-3.jpg`
}

type ForYouDurationItem = {
  id: string
  streamUrl: string
}

async function readClientPlaylistDuration(playlistUrl: string): Promise<number | null> {
  const response = await fetch(playlistUrl)

  if (!response.ok) {
    return null
  }

  const playlistText = await response.text()

  if (!playlistText.includes('#EXTM3U')) {
    return null
  }

  const variantLine = playlistText
    .split('\n')
    .map((line) => line.trim())
    .find((line) => line && !line.startsWith('#'))

  if (variantLine?.includes('.m3u8')) {
    return readClientPlaylistDuration(new URL(variantLine, response.url).href)
  }

  const total = [...playlistText.matchAll(/#EXTINF:([\d.]+)/g)].reduce(
    (sum, match) => sum + Number.parseFloat(match[1]),
    0,
  )

  return total > 0 ? total : null
}

async function fetchVideoDurationFromProxy(mediaId: string): Promise<number | null> {
  const forYouResponse = await fetch(`${API_BASE}/api/for-you`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ startId: mediaId, limit: 1 }),
  })

  if (!forYouResponse.ok) {
    return null
  }

  const data = (await forYouResponse.json()) as { items?: ForYouDurationItem[] }
  const item = data.items?.find((entry) => entry.id === mediaId) ?? data.items?.[0]

  if (!item?.streamUrl) {
    return null
  }

  const streamPageUrl = item.streamUrl.startsWith('http')
    ? item.streamUrl
    : `${API_BASE}${item.streamUrl}`

  const streamResponse = await fetch(streamPageUrl, { redirect: 'follow' })

  if (!streamResponse.ok) {
    return null
  }

  return readClientPlaylistDuration(streamResponse.url)
}

export async function fetchVideoDuration(mediaId: string): Promise<number | null> {
  if (durationCache.has(mediaId)) {
    return durationCache.get(mediaId) ?? null
  }

  try {
    const response = await fetch(`/api/duration/${encodeURIComponent(mediaId)}`)
    const contentType = response.headers.get('content-type') ?? ''

    if (response.ok && contentType.includes('application/json')) {
      const data = (await response.json()) as { duration?: number | null }
      const duration =
        typeof data.duration === 'number' && data.duration > 0 ? data.duration : null

      if (duration !== null) {
        durationCache.set(mediaId, duration)
        return duration
      }
    }
  } catch {
    // Fall through to client-side proxy lookup.
  }

  try {
    const duration = await fetchVideoDurationFromProxy(mediaId)
    durationCache.set(mediaId, duration)
    return duration
  } catch {
    durationCache.set(mediaId, null)
    return null
  }
}

export function formatDuration(seconds: number): string {
  const wholeSeconds = Math.max(0, Math.round(seconds))
  const minutes = Math.floor(wholeSeconds / 60)
  const remainder = wholeSeconds % 60

  if (minutes >= 60) {
    const hours = Math.floor(minutes / 60)
    const mins = minutes % 60
    return `${hours}:${mins.toString().padStart(2, '0')}:${remainder.toString().padStart(2, '0')}`
  }

  return `${minutes}:${remainder.toString().padStart(2, '0')}`
}

export function parseMediaJson(html: string): MediaItem[] {
  const marker = 'const mediaJson = "'
  const start = html.indexOf(marker)

  if (start < 0) {
    throw new Error('No media data found for this profile')
  }

  const contentStart = start + marker.length
  let index = contentStart
  let escaped = false

  while (index < html.length) {
    const char = html[index]

    if (escaped) {
      escaped = false
      index += 1
      continue
    }

    if (char === '\\') {
      escaped = true
      index += 1
      continue
    }

    if (char === '"') {
      break
    }

    index += 1
  }

  const raw = html
    .slice(contentStart, index)
    .replace(/\\"/g, '"')
    .replace(/\\\\/g, '\\')

  const data = JSON.parse(raw) as MediaItem[]

  if (!Array.isArray(data)) {
    throw new Error('Profile media payload was invalid')
  }

  return data
}

export async function fetchCreators(
  page: number,
  limit: number,
  search?: string,
): Promise<CreatorsResponse> {
  const params = new URLSearchParams({
    page: String(page),
    limit: String(limit),
  })

  if (search?.trim()) {
    params.set('search', search.trim())
  }

  const response = await fetch(`${API_BASE}/api/creators?${params}`)

  if (!response.ok) {
    throw new Error(`Creators request failed (${response.status})`)
  }

  return response.json() as Promise<CreatorsResponse>
}

export async function fetchUserMedia(username: string): Promise<MediaItem[]> {
  const response = await fetch(`${API_BASE}/user/${encodeURIComponent(username)}`)

  if (!response.ok) {
    throw new Error(`Profile request failed (${response.status})`)
  }

  const html = await response.text()
  return parseMediaJson(html)
}
