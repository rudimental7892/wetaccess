/**
 * LeakedZone guest HTML adapter.
 * Catalog + media pages are SSR Blade; streams come from JWPlayer f() deobfuscation.
 */

export const LZ_ORIGIN = 'https://leakedzone.com'
export const LZ_CDN = 'https://image-cdn.leakedzone.com'

const UA =
  'Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/131.0.0.0 Safari/537.36'

const RESERVED_SLUGS = new Set([
  'creators',
  'videos',
  'shorts',
  'premium',
  'login',
  'register',
  'feed',
  'search',
  'user',
  'download',
  'm3u8',
  'storage',
  'api',
  'v2',
  'cdn-cgi',
  'favicon.ico',
  'favicon.svg',
  'site.webmanifest',
  'apple-touch-icon.png',
  'logo-v2.png',
  'request-model',
])

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
  poster: string | null
}

function sleep(ms: number): Promise<void> {
  return new Promise((r) => setTimeout(r, ms))
}

export async function lzFetchHtml(pathOrUrl: string): Promise<string> {
  const url = pathOrUrl.startsWith('http')
    ? pathOrUrl
    : `${LZ_ORIGIN}${pathOrUrl.startsWith('/') ? '' : '/'}${pathOrUrl}`

  let lastErr: unknown
  for (let attempt = 0; attempt < 3; attempt++) {
    try {
      const res = await fetch(url, {
        headers: {
          'User-Agent': UA,
          Accept: 'text/html,application/xhtml+xml',
          'Accept-Language': 'en-US,en;q=0.9',
          Referer: `${LZ_ORIGIN}/`,
        },
        redirect: 'follow',
      })
      const text = await res.text()
      if (text.includes('Just a moment') && text.includes('cf-browser-verification')) {
        throw new Error('Cloudflare challenge (try again slowly)')
      }
      if (!res.ok) {
        throw new Error(`LeakedZone HTTP ${res.status}`)
      }
      return text
    } catch (e) {
      lastErr = e
      if (attempt < 2) await sleep(400 * (attempt + 1))
    }
  }
  throw lastErr instanceof Error ? lastErr : new Error(String(lastErr))
}

/** JWPlayer payload: slice(16,-16) + reverse + atob */
export function decodeJwFile(payload: string): string {
  const mid = payload.slice(16, -16)
  const reversed = mid.split('').reverse().join('')
  if (typeof atob === 'function') {
    return atob(reversed)
  }
  return Buffer.from(reversed, 'base64').toString('utf8')
}

export function hlsProxyUrl(m3u8: string): string {
  return `/api/hls-proxy?url=${encodeURIComponent(m3u8)}`
}

function decodeHtmlEntities(s: string): string {
  return s
    .replace(/&commat;/gi, '@')
    .replace(/&amp;/g, '&')
    .replace(/&lt;/g, '<')
    .replace(/&gt;/g, '>')
    .replace(/&quot;/g, '"')
    .replace(/&#39;/g, "'")
    .replace(/&nbsp;/g, ' ')
}

function absUrl(src: string): string {
  if (src.startsWith('http')) return src
  if (src.startsWith('//')) return `https:${src}`
  return `${LZ_ORIGIN}${src.startsWith('/') ? '' : '/'}${src}`
}

function parsePager(html: string): { current: number; last: number | null } {
  const current = Number.parseInt(
    html.match(/data-current="(\d+)"/)?.[1] ?? '1',
    10,
  )
  const lastRaw = html.match(/data-last="(\d+)"/)?.[1]
  const last = lastRaw ? Number.parseInt(lastRaw, 10) : null
  return {
    current: Number.isFinite(current) && current > 0 ? current : 1,
    last: last && Number.isFinite(last) && last > 0 ? last : null,
  }
}

export function parseCreatorsHtml(html: string, page: number): LzCreatorsPage {
  const { current, last } = parsePager(html)
  const lastPage = last ?? page
  const seen = new Set<string>()
  const items: LzCreator[] = []

  // Creator grid cards use class "w-full block …" — avoids nav /creators linking into first avatar.
  const cardRe =
    /href="https?:\/\/(?:www\.)?leakedzone\.com\/([^"/?#]+)"[^>]*class="[^"]*\bw-full\b[^"]*\bblock\b[^"]*"[^>]*>[\s\S]{0,600}?src="([^"]*storage\/models\/(\d+)\/avatar\.(?:jpg|jpeg|webp|png)[^"]*)"(?:[^>]*alt="([^"]*)")?/gi

  let m: RegExpExecArray | null
  while ((m = cardRe.exec(html)) !== null) {
    const slug = decodeURIComponent(m[1]).trim()
    if (!slug || RESERVED_SLUGS.has(slug.toLowerCase())) continue
    if (seen.has(slug)) continue
    seen.add(slug)
    const modelId = m[3]
    const avatar = absUrl(m[2])
    const name = decodeHtmlEntities((m[4] || slug).trim()) || slug
    items.push({ slug, name, modelId, avatar })
  }

  // Fallback without class constraint (tighter window)
  if (items.length === 0) {
    const loose =
      /href="https?:\/\/(?:www\.)?leakedzone\.com\/([a-zA-Z0-9._-]+)"[^>]*>\s*<div[\s\S]{0,200}?src="([^"]*storage\/models\/(\d+)\/avatar\.(jpg|webp|png)[^"]*)"(?:[^>]*alt="([^"]*)")?/gi
    while ((m = loose.exec(html)) !== null) {
      const slug = m[1]
      if (RESERVED_SLUGS.has(slug.toLowerCase()) || seen.has(slug)) continue
      seen.add(slug)
      items.push({
        slug,
        name: decodeHtmlEntities((m[5] || slug).trim()) || slug,
        modelId: m[3],
        avatar: absUrl(m[2]),
      })
    }
  }

  const resolvedPage = current || page
  const hasMore = resolvedPage < lastPage || (last == null && items.length >= 24)

  return {
    items,
    page: resolvedPage,
    lastPage,
    hasMore,
    totalEstimate: lastPage * Math.max(items.length, 1),
  }
}

function fullPhotoFromThumb(thumb: string): string {
  return thumb.replace(/_300\.(webp|jpg|jpeg|png)$/i, '.$1')
}

export function parseMediaHtml(
  html: string,
  slug: string,
  tab: 'video' | 'photo',
): LzMediaItem[] {
  const items: LzMediaItem[] = []
  const seen = new Set<string>()
  const esc = slug.replace(/[.*+?^${}()|[\]\\]/g, '\\$&')

  // Thumb path IDs often differ from video/photo route IDs — pair via card markup.
  const cardRe = new RegExp(
    `href="https?:\\/\\/(?:www\\.)?leakedzone\\.com\\/${esc}\\/(video|photo)\\/(\\d+)"[^>]*>[\\s\\S]{0,500}?src="(https:\\/\\/image-cdn\\.leakedzone\\.com\\/storage\\/images\\/(\\d+)\\/[^"]+)"`,
    'gi',
  )

  let m: RegExpExecArray | null
  while ((m = cardRe.exec(html)) !== null) {
    const type = m[1].toLowerCase() as 'video' | 'photo'
    if (tab === 'video' && type !== 'video') continue
    if (tab === 'photo' && type !== 'photo') continue
    const id = m[2]
    if (seen.has(id)) continue
    seen.add(id)
    const thumb = m[3]
    const modelId = m[4]
    const item: LzMediaItem = {
      id,
      type,
      slug,
      thumb,
      modelId,
    }
    if (type === 'photo') {
      item.full = fullPhotoFromThumb(thumb)
    }
    items.push(item)
  }

  // Fallback: links only
  if (items.length === 0) {
    const linkRe = new RegExp(
      `href="https?:\\/\\/(?:www\\.)?leakedzone\\.com\\/${esc}\\/(video|photo)\\/(\\d+)"`,
      'gi',
    )
    while ((m = linkRe.exec(html)) !== null) {
      const type = m[1].toLowerCase() as 'video' | 'photo'
      if (tab === 'video' && type !== 'video') continue
      if (tab === 'photo' && type !== 'photo') continue
      const id = m[2]
      if (seen.has(id)) continue
      seen.add(id)
      items.push({ id, type, slug, thumb: '' })
    }
  }

  return items
}

export function parseProfileMeta(html: string, slug: string): {
  name: string
  title: string
  photoCount: number | null
  videoCount: number | null
  avatar: string | null
} {
  const title =
    html.match(/<title>([^<]+)<\/title>/i)?.[1]?.trim() ??
    `${slug} | LeakedZone`
  const nameFromTitle =
    title.match(/^([^|(—\-]+?)(?:\s*\(|\s*—|\s*-\s*|\s*OnlyFans)/i)?.[1]?.trim() ||
    slug
  const photoRaw = html.match(/([\d,]+)\s*Photos?/i)?.[1]
  const videoRaw = html.match(/([\d,]+)\s*Videos?/i)?.[1]
  const photoCount = photoRaw
    ? Number.parseInt(photoRaw.replace(/,/g, ''), 10)
    : null
  const videoCount = videoRaw
    ? Number.parseInt(videoRaw.replace(/,/g, ''), 10)
    : null

  const avatarMatch =
    html.match(
      /(?:src|href)="([^"]*storage\/models\/\d+\/avatar\.(?:jpg|jpeg|webp|png)[^"]*)"/i,
    )?.[1] ?? null

  return {
    name: decodeHtmlEntities(nameFromTitle),
    title: decodeHtmlEntities(title),
    photoCount: Number.isFinite(photoCount as number) ? photoCount : null,
    videoCount: Number.isFinite(videoCount as number) ? videoCount : null,
    avatar: avatarMatch ? absUrl(avatarMatch) : null,
  }
}

export async function fetchLzCreators(opts: {
  page?: number
  networks?: string
  sort?: string
}): Promise<LzCreatorsPage> {
  const page = Math.max(1, opts.page ?? 1)
  const params = new URLSearchParams()
  params.set('page', String(page))
  if (opts.networks) params.set('Networks', opts.networks)
  if (opts.sort) params.set('sort', opts.sort)
  const html = await lzFetchHtml(`/creators?${params.toString()}`)
  return parseCreatorsHtml(html, page)
}

export async function fetchLzProfile(opts: {
  slug: string
  tab?: 'video' | 'photo'
  page?: number
  sort?: string
}): Promise<LzProfilePage> {
  const slug = opts.slug.trim().replace(/^@/, '')
  if (!slug || RESERVED_SLUGS.has(slug.toLowerCase())) {
    throw new Error('invalid slug')
  }
  const tab = opts.tab === 'photo' ? 'photo' : 'video'
  const page = Math.max(1, opts.page ?? 1)
  const params = new URLSearchParams()
  if (page > 1) params.set('page', String(page))
  // sort=newest makes profile video pagination reliable
  params.set('sort', opts.sort || 'newest')
  const qs = params.toString()
  const path =
    tab === 'photo'
      ? `/${encodeURIComponent(slug)}/photo${qs ? `?${qs}` : ''}`
      : `/${encodeURIComponent(slug)}/video${qs ? `?${qs}` : ''}`

  const html = await lzFetchHtml(path)
  const meta = parseProfileMeta(html, slug)
  const { current, last } = parsePager(html)
  const items = parseMediaHtml(html, slug, tab)

  // Videos often lack data-last; treat full pages as hasMore
  const pageSizeHint = tab === 'photo' ? 48 : 36
  const hasMore =
    last != null
      ? (current || page) < last
      : items.length >= pageSizeHint - 2

  return {
    slug,
    name: meta.name,
    title: meta.title,
    photoCount: meta.photoCount,
    videoCount: meta.videoCount,
    tab,
    page: current || page,
    lastPage: last,
    hasMore,
    items,
    avatar: meta.avatar,
  }
}

export async function fetchLzStream(
  slug: string,
  id: string,
): Promise<LzStreamResult> {
  const cleanSlug = slug.trim().replace(/^@/, '')
  const cleanId = id.replace(/\D/g, '')
  if (!cleanSlug || !cleanId) throw new Error('missing slug or id')

  const html = await lzFetchHtml(
    `/${encodeURIComponent(cleanSlug)}/video/${cleanId}`,
  )

  const payload = html.match(/file:\s*f\("([^"]+)"\)/)?.[1]
  if (!payload) {
    throw new Error('JWPlayer stream payload not found')
  }

  let m3u8: string
  try {
    m3u8 = decodeJwFile(payload)
  } catch {
    throw new Error('failed to decode stream payload')
  }

  if (!m3u8.includes('.m3u8')) {
    throw new Error('decoded payload is not an m3u8 URL')
  }

  const poster =
    html.match(
      /https:\/\/image-cdn\.leakedzone\.com\/storage\/images\/\d+\/[^"'\s]+_300\.(?:webp|jpg)/i,
    )?.[0] ??
    html.match(
      /https:\/\/image-cdn\.leakedzone\.com\/storage\/images\/\d+\/[^"'\s]+\.(?:webp|jpg)/i,
    )?.[0] ??
    null

  return {
    slug: cleanSlug,
    id: cleanId,
    m3u8,
    hls: hlsProxyUrl(m3u8),
    poster,
  }
}
