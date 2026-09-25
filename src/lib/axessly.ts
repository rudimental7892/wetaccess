export type AxCreator = {
  id?: string
  username: string
  name?: string
  full_name?: string
  avatar_url?: string
  banner_url?: string
  bio?: string
  is_verified?: boolean
  followers_count?: number
  following_count?: number
  subscribers_count?: number
  posts_count?: number
  subscription_price?: number | null
  category?: string | null
  is_live?: boolean
}

export type AxPostCreator = {
  id?: string
  username: string
  name?: string
  avatar_url?: string
  is_verified?: boolean
  banner_url?: string
  subscription_price?: number | null
}

export type AxPost = {
  id: string
  caption?: string
  type?: string
  is_premium?: boolean
  locked?: boolean
  visibility?: string
  price?: number | null
  media_url?: string | null
  device_playback_url?: string | null
  thumb_url?: string | null
  cf_stream_uid?: string | null
  iframe_url?: string | null
  tease_at?: number | null
  duration?: number | null
  like_count?: number
  comment_count?: number
  created_at?: string
  creator?: AxPostCreator | null
}

const API = '/api/ax'

async function axGet<T>(
  op: string,
  params?: Record<string, string>,
): Promise<T> {
  const qs = new URLSearchParams({ op, ...params })
  const res = await fetch(`${API}?${qs}`)
  const body = (await res.json()) as T & { error?: string }
  if (!res.ok) {
    throw new Error(
      (body as Record<string, string>).error ?? `Axessly HTTP ${res.status}`,
    )
  }
  return body
}

function unwrapArray<T>(data: unknown, keys: string[]): T[] {
  if (Array.isArray(data)) return data as T[]
  if (data && typeof data === 'object') {
    const obj = data as Record<string, unknown>
    for (const k of keys) {
      const val = obj[k]
      if (Array.isArray(val)) return val as T[]
    }
    if (obj.data && typeof obj.data === 'object' && !Array.isArray(obj.data)) {
      const inner = obj.data as Record<string, unknown>
      for (const k of keys) {
        const val = inner[k]
        if (Array.isArray(val)) return val as T[]
      }
    }
    if (Array.isArray(obj.data)) return obj.data as T[]
  }
  return []
}

export async function fetchAxCreators(): Promise<AxCreator[]> {
  const data = await axGet<unknown>('creators')
  return unwrapArray<AxCreator>(data, ['creators', 'data', 'results'])
}

export async function fetchAxPosts(username: string): Promise<AxPost[]> {
  const data = await axGet<unknown>('posts', { username })
  return unwrapArray<AxPost>(data, ['posts', 'data', 'results'])
}

export async function fetchAxFeed(limit = 50): Promise<AxPost[]> {
  const data = await axGet<unknown>('feed', { limit: String(limit) })
  return unwrapArray<AxPost>(data, ['posts', 'data', 'results'])
}

export function axStreamUrl(cfStreamUid: string): string {
  return `https://customer-6e6tcq3mf658whbd.cloudflarestream.com/${cfStreamUid}/manifest/video.m3u8`
}

export function axWatchHash(uid: string): string {
  return `#/watch/${encodeURIComponent(uid)}`
}

export function axIsLocked(post: AxPost): boolean {
  return Boolean(post.locked)
}

export function axIsPremium(post: AxPost): boolean {
  return (
    Boolean(post.is_premium) ||
    post.visibility === 'paid' ||
    post.visibility === 'subscribers'
  )
}

export function axFormatPrice(price: number | null | undefined): string {
  if (price == null) return ''
  return `₦${price.toLocaleString()}`
}

export function axFormatDuration(
  seconds: number | null | undefined,
): string {
  if (seconds == null || !Number.isFinite(seconds) || seconds < 0) return ''
  const s = Math.round(seconds)
  const h = Math.floor(s / 3600)
  const m = Math.floor((s % 3600) / 60)
  const r = s % 60
  if (h > 0) {
    return `${h}:${String(m).padStart(2, '0')}:${String(r).padStart(2, '0')}`
  }
  return `${m}:${String(r).padStart(2, '0')}`
}

export function axFormatDate(dateStr: string | null | undefined): string {
  if (!dateStr) return '—'
  try {
    return new Date(dateStr).toLocaleString()
  } catch {
    return '—'
  }
}
