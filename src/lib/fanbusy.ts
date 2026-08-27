export type FbSubscriptionTier = {
  month_fee?: number | null
  quarterly_fee?: number | null
  half_yearly_fee?: number | null
  yearly_fee?: number | null
  promotion_fee?: {
    value?: number | null
    reduction?: number | null
    expired_at?: string | null
    text?: string | null
  } | null
}

export type FbCreator = {
  _id: string
  display_name?: string | null
  pseudo?: string | null
  full_name?: string | null
  email?: string | null
  country_code?: string | null
  phone_number?: string | null
  photo?: string | null
  mine_photo?: string | null
  mine_banner?: string | null
  banner?: string | null
  bio?: string | null
  id_type?: string | null
  id_image?: string | null
  id_card_image?: string | null
  postal_code?: string | null
  street_number?: string | null
  street_name?: string | null
  city?: string | null
  localisation?: string | null
  web_site?: string | null
  account_type?: string | null
  is_free_account?: boolean | null
  subscription_fee?: number | null
  active_tchat?: boolean | null
  tchat_fee?: number | null
  video_call_fee?: number | null
  tchat_fee_period?: number | null
  currency?: string | null
  lang?: string | null
  verified?: boolean | null
  fan_number?: number | null
  follow_number?: number | null
  like_number?: number | null
  verification_code?: string | null
  social_link?: string | null
  password?: string | null
  tag?: string | null
  fan_tag?: string | null
  creator_tag?: string | null
  active_creator?: boolean | null
  have_stories?: boolean | null
  is_deleted?: boolean | null
  water_mark?: string | null
  affiliation_code?: string | null
  force_logout_date?: string | null
  subscriptions_details?: {
    african_fee?: FbSubscriptionTier | null
    asian_fee?: FbSubscriptionTier | null
    other_fee?: FbSubscriptionTier | null
  } | null
  created_at?: string | null
  updated_at?: string | null
}

export type FbIllustration = {
  _id: string
  link?: string | null
  link_compressed?: string | null
  extra_links?: { hls?: string | null } | null
  mime_type?: string | null
  type?: string | null
  is_thumbnail?: boolean | null
  cover_image?: boolean | null
}

export type FbPost = {
  _id: string
  content?: string | null
  comment_disabled?: boolean | null
  is_free?: boolean | null
  price_of_release?: number | null
  release_details?: {
    african_fee?: number | null
    asian_fee?: number | null
    other_fee?: number | null
  } | null
  currency?: string | null
  tip_amount?: number | null
  tip_number?: number | null
  like_number?: number | null
  comment_number?: number | null
  view_number?: number | null
  illustrations?: FbIllustration[] | null
  type?: string | null
  pdf_post?: boolean | null
  cover_image?: string | null
  discover?: boolean | null
  media_status?: string | null
  collection_id?: string | null
  tag?: string | null
  creator?: FbCreator | null
  created_at?: string | null
  updated_at?: string | null
}

export type FbPaginate = {
  total?: number
  per_page?: number
  current_page?: number
  last_page?: number
}

export type FbListResponse<T> = {
  status_code?: number
  response_type?: string
  description?: string
  data?: T
  paginage?: FbPaginate
  detail?: string
  error?: string
}

export type FbStats = {
  total?: number
  creators?: number
  fans?: number
}

async function fbGet<T>(
  path: string,
  params?: Record<string, string | number | undefined>,
): Promise<FbListResponse<T>> {
  const qs = new URLSearchParams()
  qs.set('path', path)
  if (params) {
    for (const [k, v] of Object.entries(params)) {
      if (v !== undefined && v !== '') qs.set(k, String(v))
    }
  }
  const res = await fetch(`/api/fb?${qs.toString()}`)
  const body = (await res.json()) as FbListResponse<T>
  if (!res.ok) {
    throw new Error(body.error ?? body.detail ?? `FanBusy HTTP ${res.status}`)
  }
  return body
}

export async function fetchFbStats(): Promise<FbStats> {
  const body = await fbGet<FbStats>('statistics/creators')
  return body.data ?? {}
}

export async function fetchFbUsers(
  page: number,
  size = 20,
): Promise<{ users: FbCreator[]; pageInfo: FbPaginate }> {
  const body = await fbGet<FbCreator[]>('creators/', { page, size })
  return {
    users: Array.isArray(body.data) ? body.data : [],
    pageInfo: body.paginage ?? {},
  }
}

export async function fetchFbCreatorByPseudo(pseudo: string): Promise<FbCreator | null> {
  const body = await fbGet<FbCreator>(`creators/u/${encodeURIComponent(pseudo)}`)
  return body.data ?? null
}

export async function fetchFbCreatorFull(id: string): Promise<FbCreator | null> {
  const body = await fbGet<FbCreator>(`creators/full/${encodeURIComponent(id)}`)
  return body.data ?? null
}

export async function fetchFbPosts(
  page: number,
  opts?: { nsfw?: boolean; limit?: number },
): Promise<{ posts: FbPost[]; pageInfo: FbPaginate }> {
  const limit = opts?.limit ?? 20
  const path = opts?.nsfw ? 'posts/all/nsfw' : 'posts/'
  const body = await fbGet<FbPost[]>(path, { page, limit })
  return {
    posts: Array.isArray(body.data) ? body.data : [],
    pageInfo: body.paginage ?? {},
  }
}

export async function fetchFbPostsByCreator(
  creatorId: string,
): Promise<FbPost[]> {
  const path = `posts/creator/${encodeURIComponent(creatorId)}`
  const limit = 50
  const first = await fbGet<FbPost[]>(path, { skip: 1, limit })
  const firstRows = Array.isArray(first.data) ? first.data : []
  const lastPage = Math.max(1, first.paginage?.last_page ?? 1)
  if (lastPage <= 1) return firstRows

  const rest = await Promise.all(
    Array.from({ length: Math.min(lastPage - 1, 99) }, (_, i) =>
      fbGet<FbPost[]>(path, { skip: i + 2, limit }),
    ),
  )
  const all = [...firstRows]
  for (const body of rest) {
    const rows = Array.isArray(body.data) ? body.data : []
    all.push(...rows)
  }
  return all
}

export async function fetchFbPost(postId: string): Promise<FbPost | null> {
  const body = await fbGet<FbPost>(`posts/${encodeURIComponent(postId)}`)
  return body.data ?? null
}

export function fbAvatar(user: FbCreator | null | undefined): string {
  if (!user) return ''
  return (
    user.mine_photo ||
    user.photo ||
    user.banner ||
    user.mine_banner ||
    ''
  )
}

export function fbMediaUrl(ill: FbIllustration | null | undefined): string {
  if (!ill) return ''
  return ill.extra_links?.hls || ill.link_compressed || ill.link || ''
}

/** Prefer progressive file for <video> poster/metadata when HLS is primary. */
export function fbProgressiveUrl(
  ill: FbIllustration | null | undefined,
): string {
  if (!ill) return ''
  const link = ill.link || ''
  const compressed = ill.link_compressed || ''
  for (const u of [compressed, link]) {
    if (u && !u.includes('.m3u8') && !u.includes('/hls/')) return u
  }
  return ''
}

export function fbIsHlsUrl(url: string): boolean {
  const u = url.toLowerCase()
  return u.includes('.m3u8') || u.includes('/hls/')
}

export function fbIsVideo(ill: FbIllustration | null | undefined): boolean {
  if (!ill) return false
  const url = fbMediaUrl(ill).toLowerCase()
  const mime = (ill.mime_type || '').toLowerCase()
  return (
    mime.includes('video') ||
    url.includes('.m3u8') ||
    url.includes('/hls/') ||
    /\.(mp4|mov|webm|m4v)(\?|$)/i.test(url)
  )
}

/** Poster still: post cover, thumbnail illustration, or sibling image. */
export function fbPosterUrl(
  ill: FbIllustration,
  post?: FbPost | null,
): string {
  if (post?.cover_image) return post.cover_image
  if (ill.cover_image && ill.link && !fbIsVideo(ill)) return ill.link
  for (const sib of post?.illustrations ?? []) {
    if (sib._id === ill._id) continue
    if (sib.is_thumbnail || sib.cover_image) {
      const u = sib.link_compressed || sib.link
      if (u && !fbIsVideo(sib)) return u
    }
  }
  for (const sib of post?.illustrations ?? []) {
    if (sib._id === ill._id) continue
    const mime = (sib.mime_type || '').toLowerCase()
    const u = sib.link_compressed || sib.link || ''
    if (mime.includes('image') || /\.(jpe?g|png|webp|gif)(\?|$)/i.test(u)) {
      return u
    }
  }
  return ''
}

export function fbFormatDuration(
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

export function fbFormatMoney(
  amount: number | null | undefined,
  currency?: string | null,
): string {
  if (amount == null || Number.isNaN(amount)) return '—'
  const cur = (currency || 'USD').toUpperCase()
  try {
    return new Intl.NumberFormat(undefined, {
      style: 'currency',
      currency: cur.length === 3 ? cur : 'USD',
      maximumFractionDigits: 2,
    }).format(amount)
  } catch {
    return `${amount} ${cur}`
  }
}
