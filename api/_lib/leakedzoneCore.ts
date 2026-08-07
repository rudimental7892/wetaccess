/**
 * LeakedZone guest HTML adapter.
 * Catalog + media pages are SSR Blade; streams come from JWPlayer f() deobfuscation.
 */

// Vercel ESM requires explicit .js extension for relative imports at runtime.
import { LZ_CREATORS_BOOTSTRAP } from './lzCreatorsBootstrap.js'

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
  /** Same-origin playlist that rewrites Bunny segments (may 502 on CF-blocked hosts). */
  playlist: string
  poster: string | null
  /** Direct LZ watch page — used when Vercel IP is CF-blocked for /m3u8. */
  embedUrl: string
  source?: 'direct' | 'relay'
}

function sleep(ms: number): Promise<void> {
  return new Promise((r) => setTimeout(r, ms))
}

function envCookie(): string | undefined {
  const raw =
    (typeof process !== 'undefined' &&
      (process.env.LZ_COOKIE || process.env.LEAKEDZONE_COOKIE)) ||
    ''
  return raw.trim() || undefined
}

function isCloudflareChallenge(status: number, text: string): boolean {
  if (status === 403 || status === 503) {
    if (
      text.includes('Just a moment') ||
      text.includes('cf-browser-verification') ||
      text.includes('cf-challenge') ||
      text.includes('challenge-platform') ||
      text.includes('Attention Required')
    ) {
      return true
    }
  }
  return (
    text.includes('Just a moment') &&
    (text.includes('cf-') || text.includes('Cloudflare'))
  )
}

function looksLikeLzHtml(text: string): boolean {
  return (
    text.includes('storage/models') ||
    text.includes('leakedzone') ||
    text.includes('jwplayer') ||
    text.includes('data-last=') ||
    text.includes('file: f(') ||
    text.includes('media-items')
  )
}

const BROWSER_HEADERS: Record<string, string> = {
  'User-Agent': UA,
  Accept:
    'text/html,application/xhtml+xml,application/xml;q=0.9,image/avif,image/webp,*/*;q=0.8',
  'Accept-Language': 'en-US,en;q=0.9',
  'Cache-Control': 'no-cache',
  'Sec-Ch-Ua':
    '"Google Chrome";v="131", "Chromium";v="131", "Not_A Brand";v="24"',
  'Sec-Ch-Ua-Mobile': '?0',
  'Sec-Ch-Ua-Platform': '"macOS"',
  'Sec-Fetch-Dest': 'document',
  'Sec-Fetch-Mode': 'navigate',
  'Sec-Fetch-Site': 'none',
  'Sec-Fetch-User': '?1',
  'Upgrade-Insecure-Requests': '1',
}

/** Sticky session cookies across warm-up + page fetches (per isolate). */
let stickyCookie = ''

function mergeSetCookie(res: Response): void {
  // Node/undici may expose getSetCookie(); fall back to single header.
  const anyHeaders = res.headers as Headers & { getSetCookie?: () => string[] }
  const list =
    typeof anyHeaders.getSetCookie === 'function'
      ? anyHeaders.getSetCookie()
      : []
  const single = res.headers.get('set-cookie')
  const parts = list.length > 0 ? list : single ? [single] : []
  if (!parts.length) return
  const jar = new Map<string, string>()
  for (const piece of (stickyCookie ? stickyCookie.split('; ') : []).concat(
    parts.map((p) => p.split(';')[0] ?? '').filter(Boolean),
  )) {
    const eq = piece.indexOf('=')
    if (eq <= 0) continue
    jar.set(piece.slice(0, eq), piece.slice(eq + 1))
  }
  stickyCookie = [...jar.entries()].map(([k, v]) => `${k}=${v}`).join('; ')
}

function abortSignal(ms: number): AbortSignal | undefined {
  try {
    return AbortSignal.timeout(ms)
  } catch {
    return undefined
  }
}

async function directFetchHtml(url: string): Promise<string> {
  // Warm homepage once for Laravel session cookies when cold (short timeout).
  if (!stickyCookie && !envCookie()) {
    try {
      const warm = await fetch(`${LZ_ORIGIN}/`, {
        headers: { ...BROWSER_HEADERS, Referer: `${LZ_ORIGIN}/` },
        redirect: 'follow',
        signal: abortSignal(6_000),
      })
      mergeSetCookie(warm)
      await warm.text()
    } catch {
      // ignore warm-up failures
    }
  }

  const headers: Record<string, string> = {
    ...BROWSER_HEADERS,
    Referer: `${LZ_ORIGIN}/`,
    'Sec-Fetch-Site': 'same-origin',
  }
  const mergedCookie = [stickyCookie, envCookie()].filter(Boolean).join('; ')
  if (mergedCookie) headers.Cookie = mergedCookie

  const res = await fetch(url, {
    headers,
    redirect: 'follow',
    signal: abortSignal(10_000),
  })
  mergeSetCookie(res)
  const text = await res.text()
  if (isCloudflareChallenge(res.status, text)) {
    throw new Error('Cloudflare challenge')
  }
  if (!res.ok) {
    throw new Error(`LeakedZone HTTP ${res.status}`)
  }
  if (!looksLikeLzHtml(text) && text.length < 2000) {
    throw new Error('Unexpected LeakedZone response')
  }
  return text
}

/**
 * Free/optional HTML relays when Cloudflare blocks datacenter IPs (Vercel).
 * Order: custom proxy → jina (optional key) → allorigins.
 */
async function relayFetchHtml(url: string): Promise<string> {
  const errors: string[] = []

  // 1) Custom proxy: LZ_FETCH_PROXY="https://proxy.example/?url=%s"
  const custom =
    typeof process !== 'undefined' ? process.env.LZ_FETCH_PROXY || '' : ''
  if (custom.includes('%s') || custom.includes('{url}')) {
    try {
      const target = custom.includes('%s')
        ? custom.replace('%s', encodeURIComponent(url))
        : custom.replace('{url}', encodeURIComponent(url))
      const res = await fetch(target, {
        headers: { 'User-Agent': UA, Accept: 'text/html,*/*' },
        redirect: 'follow',
      })
      const text = await res.text()
      if (res.ok && looksLikeLzHtml(text)) return text
      errors.push(`custom-proxy HTTP ${res.status}`)
    } catch (e) {
      errors.push(`custom-proxy: ${e instanceof Error ? e.message : String(e)}`)
    }
  }

  const withTimeout = async (
    label: string,
    ms: number,
    fn: () => Promise<string | null>,
  ): Promise<string | null> => {
    try {
      const result = await Promise.race([
        fn(),
        sleep(ms).then(() => {
          throw new Error('timeout')
        }),
      ])
      return result
    } catch (e) {
      errors.push(`${label}: ${e instanceof Error ? e.message : String(e)}`)
      return null
    }
  }

  // 2) Jina reader (optional JINA_API_KEY / LZ_JINA_KEY for higher limits)
  const viaJina = await withTimeout('jina', 12_000, async () => {
    const headers: Record<string, string> = {
      Accept: 'text/html,application/xhtml+xml',
      'X-Return-Format': 'html',
      'X-Timeout': '12',
      'User-Agent': UA,
    }
    const key =
      typeof process !== 'undefined'
        ? process.env.JINA_API_KEY || process.env.LZ_JINA_KEY || ''
        : ''
    if (key) headers.Authorization = `Bearer ${key}`

    const res = await fetch(`https://r.jina.ai/${url}`, {
      headers,
      redirect: 'follow',
      signal: abortSignal(12_000),
    })
    const text = await res.text()
    if (res.ok && looksLikeLzHtml(text)) return text
    throw new Error(`HTTP ${res.status}`)
  })
  if (viaJina) return viaJina

  // 3) allorigins JSON wrapper
  const viaAo = await withTimeout('allorigins', 10_000, async () => {
    const res = await fetch(
      `https://api.allorigins.win/get?url=${encodeURIComponent(url)}`,
      {
        headers: { Accept: 'application/json', 'User-Agent': UA },
        redirect: 'follow',
        signal: abortSignal(10_000),
      },
    )
    const raw = await res.text()
    if (!res.ok) throw new Error(`HTTP ${res.status}`)
    try {
      const parsed = JSON.parse(raw) as { contents?: string }
      const text = parsed.contents || ''
      if (looksLikeLzHtml(text)) return text
      throw new Error('empty/non-LZ')
    } catch (e) {
      if (looksLikeLzHtml(raw)) return raw
      throw e instanceof Error ? e : new Error(String(e))
    }
  })
  if (viaAo) return viaAo

  throw new Error(errors.join(' · ') || 'all relays failed')
}

export async function lzFetchHtml(pathOrUrl: string): Promise<string> {
  const url = pathOrUrl.startsWith('http')
    ? pathOrUrl
    : `${LZ_ORIGIN}${pathOrUrl.startsWith('/') ? '' : '/'}${pathOrUrl}`

  // Vercel/datacenter IPs get CF 403 on leakedzone.com — prefer HTML relay first.
  const onVercel =
    typeof process !== 'undefined' &&
    (process.env.VERCEL === '1' || Boolean(process.env.VERCEL_ENV))
  const relayMode =
    typeof process !== 'undefined' ? process.env.LZ_HTML_RELAY || '' : ''
  const preferRelay =
    relayMode === 'always' ||
    relayMode === 'jina' ||
    (onVercel && relayMode !== 'off' && relayMode !== 'direct')

  const errors: string[] = []
  const tryDirect = async () => {
    // Single attempt — CF 403 on Vercel is deterministic; don't burn the budget.
    try {
      return await directFetchHtml(url)
    } catch (e) {
      errors.push(e instanceof Error ? e.message : String(e))
      return null
    }
  }
  const tryRelay = async () => {
    try {
      return await relayFetchHtml(url)
    } catch (e) {
      errors.push(`relay: ${e instanceof Error ? e.message : String(e)}`)
      return null
    }
  }

  if (preferRelay) {
    const viaRelay = await tryRelay()
    if (viaRelay) return viaRelay
    const viaDirect = await tryDirect()
    if (viaDirect) return viaDirect
  } else {
    const viaDirect = await tryDirect()
    if (viaDirect) return viaDirect
    const viaRelay = await tryRelay()
    if (viaRelay) return viaRelay
  }

  throw new Error(
    `LeakedZone blocked this host (Cloudflare). ${errors.join(' · ')}`,
  )
}

type LzBootstrapFile = {
  lastPage?: number
  pages?: Record<string, LzCreator[]>
  items?: LzCreator[]
  generatedAt?: string
}

function bootstrapFromData(
  data: LzBootstrapFile,
  page: number,
): LzCreatorsPage | null {
  const items =
    data.pages?.[String(page)] ||
    (page === 1 ? data.items || data.pages?.['1'] : null) ||
    null
  if (!items?.length) return null
  const cachedPages = data.pages ? Object.keys(data.pages).length : 1
  const lastPage = data.lastPage ?? page
  // Only claim hasMore within cached pages when live is down
  const hasMore = Boolean(data.pages?.[String(page + 1)])
  return {
    items,
    page,
    lastPage: Math.max(lastPage, cachedPages),
    hasMore,
    totalEstimate: lastPage * Math.max(items.length, 1),
  }
}

/** Static fallback when every live fetch path is CF-blocked (Vercel). */
export async function loadLzCreatorsBootstrap(
  page: number,
): Promise<LzCreatorsPage | null> {
  return bootstrapFromData(LZ_CREATORS_BOOTSTRAP as unknown as LzBootstrapFile, page)
}

/** Fetch raw m3u8 body (no HTML relay — jina gets Unauthorized on /m3u8). */
export async function lzFetchM3u8(m3u8Url: string): Promise<string> {
  const headers: Record<string, string> = {
    'User-Agent': UA,
    Accept: 'application/vnd.apple.mpegurl,application/x-mpegURL,*/*',
    Referer: `${LZ_ORIGIN}/`,
    Origin: LZ_ORIGIN,
  }
  const cookie = [stickyCookie, envCookie()].filter(Boolean).join('; ')
  if (cookie) headers.Cookie = cookie

  const res = await fetch(m3u8Url, { headers, redirect: 'follow' })
  const text = await res.text()
  if (isCloudflareChallenge(res.status, text)) {
    throw new Error('Cloudflare challenge on m3u8')
  }
  if (!res.ok) {
    throw new Error(`m3u8 HTTP ${res.status}: ${text.slice(0, 120)}`)
  }
  if (!text.includes('#EXTM3U')) {
    throw new Error(`m3u8 response missing EXTM3U: ${text.slice(0, 120)}`)
  }
  return text
}

/** Rewrite absolute segment URLs through same-origin HLS proxy (Bunny works on Vercel). */
export function rewriteLzPlaylist(playlistText: string): string {
  return playlistText
    .split('\n')
    .map((line) => {
      const trimmed = line.trim()
      if (!trimmed || trimmed.startsWith('#')) {
        // URI="..." inside tags
        return line.replace(/URI="([^"]+)"/gi, (_m, uri: string) => {
          if (uri.startsWith('http')) {
            return `URI="${hlsProxyUrl(uri)}"`
          }
          return `URI="${uri}"`
        })
      }
      if (trimmed.startsWith('http://') || trimmed.startsWith('https://')) {
        return hlsProxyUrl(trimmed)
      }
      return line
    })
    .join('\n')
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

export function hlsProxyUrl(target: string): string {
  return `/api/hls-proxy?url=${encodeURIComponent(target)}`
}

export function lzPlaylistApiUrl(slug: string, id: string): string {
  const qs = new URLSearchParams({ op: 'playlist', slug, id })
  return `/api/lz?${qs.toString()}`
}

export function lzEmbedUrl(slug: string, id: string): string {
  return `${LZ_ORIGIN}/${encodeURIComponent(slug)}/video/${encodeURIComponent(id)}`
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
}): Promise<LzCreatorsPage & { note?: string }> {
  const page = Math.max(1, opts.page ?? 1)
  const params = new URLSearchParams()
  params.set('page', String(page))
  if (opts.networks) params.set('Networks', opts.networks)
  if (opts.sort) params.set('sort', opts.sort)

  try {
    const html = await lzFetchHtml(`/creators?${params.toString()}`)
    return parseCreatorsHtml(html, page)
  } catch (liveErr) {
    // Unfiltered catalog only — filters need live HTML
    if (!opts.networks && !opts.sort) {
      const cached = await loadLzCreatorsBootstrap(page)
      if (cached) {
        return {
          ...cached,
          note: `Live scrape blocked (Cloudflare). Showing cached page ${page}. ${
            liveErr instanceof Error ? liveErr.message : String(liveErr)
          }`,
        }
      }
    }
    throw liveErr
  }
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
    // Prefer same-origin playlist rewrite (Bunny segments proxy fine on Vercel).
    hls: lzPlaylistApiUrl(cleanSlug, cleanId),
    playlist: lzPlaylistApiUrl(cleanSlug, cleanId),
    poster,
    embedUrl: lzEmbedUrl(cleanSlug, cleanId),
  }
}

/**
 * Resolve signed m3u8 → rewritten playlist with Bunny segments via /api/hls-proxy.
 * On Vercel, direct m3u8 is often CF-blocked; caller should fall back to embedUrl.
 */
export async function fetchLzPlaylistBody(
  slug: string,
  id: string,
): Promise<{ body: string; m3u8: string }> {
  const stream = await fetchLzStream(slug, id)
  const raw = await lzFetchM3u8(stream.m3u8)
  return { body: rewriteLzPlaylist(raw), m3u8: stream.m3u8 }
}
