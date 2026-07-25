export type FtPersonalInfo = {
  fullName?: string
  dateOfBirth?: string
  address?: string
  whatsappNumber?: string
  mobileMoneyNumber?: string
  mobileMoneyNumber2?: string
}

export type FtAuthor = {
  _id: string
  name?: string
  username?: string
  email?: string
  image?: string
  imageBanner?: string
  bio?: string
  location?: string
  accountType?: string
  personalInfo?: FtPersonalInfo | null
  tokenIdentifier?: string
  externalId?: string
}

export type FtMedia = {
  type: 'image' | 'video'
  url: string
  mediaId: string
  mimeType?: string
  thumbnailUrl?: string
  duration?: number
  width?: number
  height?: number
  fileName?: string
  fileSize?: number
}

export type FtPost = {
  _id: string
  _creationTime: number
  content?: string
  visibility: 'public' | 'subscribers_only'
  isAdult?: boolean
  medias: FtMedia[]
  author: FtAuthor | null
}

type ConvexResponse<T> = {
  status?: string
  value?: T
  errorMessage?: string
  error?: string
}

async function ftGet<T>(
  op: string,
  params?: Record<string, string>,
): Promise<T> {
  const qs = new URLSearchParams({ op, ...params })
  const res = await fetch(`/api/ft?${qs.toString()}`)
  const body = (await res.json()) as ConvexResponse<T> & { error?: string }
  if (!res.ok) {
    throw new Error(body.error ?? `FanTribe HTTP ${res.status}`)
  }
  if (body.status === 'error') {
    throw new Error(body.errorMessage ?? 'Convex error')
  }
  if (body.status === 'success') {
    return body.value as T
  }
  // Some proxies may unwrap
  return body as unknown as T
}

export async function fetchFtPosts(): Promise<FtPost[]> {
  const value = await ftGet<FtPost[]>('posts')
  return Array.isArray(value) ? value : []
}

export async function fetchFtProfile(
  username: string,
): Promise<FtAuthor | null> {
  const value = await ftGet<FtAuthor | null>('profile', { username })
  return value ?? null
}

export function ftStreamUrl(guid: string, file = 'play_720p.mp4'): string {
  const qs = new URLSearchParams({ guid, file })
  return `/api/ft-stream?${qs.toString()}`
}

export function ftEmbedUrl(media: FtMedia): string | null {
  if (media.type !== 'video') return null
  if (media.url.includes('iframe.mediadelivery.net')) return media.url
  if (media.mediaId) {
    return `https://iframe.mediadelivery.net/embed/494644/${media.mediaId}`
  }
  return null
}

export function ftIsLocked(post: FtPost): boolean {
  return post.visibility === 'subscribers_only'
}

export function ftFormatDate(ms: number | undefined): string {
  if (!ms) return '—'
  try {
    return new Date(ms).toLocaleString()
  } catch {
    return '—'
  }
}

export function ftCreatorsFromPosts(posts: FtPost[]): FtAuthor[] {
  const map = new Map<string, FtAuthor>()
  for (const p of posts) {
    const a = p.author
    if (!a?._id) continue
    if (!map.has(a._id)) map.set(a._id, a)
  }
  return [...map.values()].sort((x, y) =>
    (x.username || x.name || '').localeCompare(y.username || y.name || ''),
  )
}

export function ftHasKyc(a: FtAuthor | null | undefined): boolean {
  const pi = a?.personalInfo
  if (!pi) return false
  return Boolean(
    pi.fullName ||
      pi.dateOfBirth ||
      pi.address ||
      pi.mobileMoneyNumber ||
      pi.whatsappNumber,
  )
}
