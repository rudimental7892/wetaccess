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

export async function fetchVideoDuration(mediaId: string): Promise<number | null> {
  if (durationCache.has(mediaId)) {
    return durationCache.get(mediaId) ?? null
  }

  try {
    const response = await fetch(
      `/local-api/duration/${encodeURIComponent(mediaId)}`,
    )

    if (!response.ok) {
      durationCache.set(mediaId, null)
      return null
    }

    const data = (await response.json()) as { duration?: number | null }
    const duration =
      typeof data.duration === 'number' && data.duration > 0 ? data.duration : null

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
