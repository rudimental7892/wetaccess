export type LzCreator = {
  slug: string
  name: string
  modelId: string
  avatar: string
}

export type LzMediaItem = {
  id: string
  type: 'video' | 'photo'
  slug: string
  thumb: string
  full?: string
  modelId?: string
}

export type LzCreatorsPage = {
  items: LzCreator[]
  page: number
  lastPage: number
  hasMore: boolean
  totalEstimate: number
  note?: string
}

export type LzProfilePage = {
  slug: string
  name: string
  title: string
  photoCount: number | null
  videoCount: number | null
  tab: 'video' | 'photo'
  page: number
  lastPage: number | null
  hasMore: boolean
  items: LzMediaItem[]
  avatar: string | null
}

export type LzStreamResult = {
  slug: string
  id: string
  m3u8: string
  hls: string
  playlist?: string
  poster: string | null
  embedUrl?: string
  source?: string
}

async function lzGet<T>(
  op: string,
  params?: Record<string, string | number | undefined>,
): Promise<T> {
  const qs = new URLSearchParams({ op })
  if (params) {
    for (const [k, v] of Object.entries(params)) {
      if (v !== undefined && v !== '') qs.set(k, String(v))
    }
  }
  const res = await fetch(`/api/lz?${qs.toString()}`)
  const body = (await res.json()) as T & { error?: string }
  if (!res.ok) {
    throw new Error(body.error ?? `LeakedZone HTTP ${res.status}`)
  }
  return body
}

export async function fetchLzCreators(opts?: {
  page?: number
  networks?: string
  sort?: string
}): Promise<LzCreatorsPage> {
  return lzGet<LzCreatorsPage>('creators', {
    page: opts?.page ?? 1,
    networks: opts?.networks,
    sort: opts?.sort,
  })
}

export async function fetchLzProfile(opts: {
  slug: string
  tab?: 'video' | 'photo'
  page?: number
  sort?: string
}): Promise<LzProfilePage> {
  return lzGet<LzProfilePage>('profile', {
    slug: opts.slug,
    tab: opts.tab ?? 'video',
    page: opts.page ?? 1,
    sort: opts.sort ?? 'newest',
  })
}

export async function fetchLzStream(
  slug: string,
  id: string,
): Promise<LzStreamResult> {
  return lzGet<LzStreamResult>('stream', { slug, id })
}

export function lzWatchHash(slug: string, id: string): string {
  return `#/watch/${encodeURIComponent(slug)}/${encodeURIComponent(id)}`
}

export function lzUserHash(slug: string): string {
  return `#/user/${encodeURIComponent(slug)}`
}

export function lzPhotoUrl(item: LzMediaItem): string {
  if (item.full) return item.full
  return item.thumb.replace(/_300\.(webp|jpg|jpeg|png)$/i, '.$1')
}

export const LZ_NETWORKS = [
  { value: '', label: 'All networks' },
  { value: 'OnlyFans', label: 'OnlyFans' },
  { value: 'Fansly', label: 'Fansly' },
  { value: 'Celebrity Uncensored', label: 'Celebrity' },
  { value: 'Reddit', label: 'Reddit' },
  { value: 'Snapchat', label: 'Snapchat' },
] as const

export const LZ_SORTS = [
  { value: '', label: 'Default' },
  { value: 'trending', label: 'Trending' },
  { value: 'views', label: 'Views' },
  { value: 'newest', label: 'Newest' },
  { value: 'oldest', label: 'Oldest' },
] as const
