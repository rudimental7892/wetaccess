export type MediaItem = {
  id: string
  media_type: '1' | '2'
  src: string
  path: string
  username: string
  webp_thumb: string | null
  /** ISO date (YYYY-MM-DD) when recoverable from the asset path */
  createdAt: string | null
  /** Milliseconds used for newest-first sorting */
  sortKey: number
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

export type DropItem = {
  id: string
  duration: string
  price: string
  isDropExclusive: number
  thumbnail: string | null
  player_url: string
}

export type Drop = {
  id: number
  username: string
  display_name: string
  title: string
  thumbnail: string | null
  release_at: string
  required_clicks: number
  click_count: number
  unlocked: boolean
  is_early_unlocked: boolean
  time_passed: boolean
  items_count?: number | null
  items?: DropItem[]
}

export type DropsResponse = {
  success?: boolean
  drops: Drop[]
}

const API_BASE = '/wet3-api'
const WET3_ORIGIN = 'https://wet3.click'

let dropsCache: Drop[] | null = null
let dropsInflight: Promise<Drop[]> | null = null

const durationCache = new Map<string, number | null>()

/**
 * wet3 now returns same-origin relative asset paths (`/media/optimized/...`,
 * `/previews/...`). Those must go through the Vite `/wet3-api` proxy — raw
 * `/media/...` hits the local app and 404s.
 */
export function wet3AssetUrl(path: string | null | undefined): string {
  if (!path) {
    return placeholderImage()
  }

  if (path.startsWith('http://') || path.startsWith('https://')) {
    return path
  }

  if (path.startsWith('/wet3-api/')) {
    return path
  }

  if (path.startsWith('/')) {
    return `${API_BASE}${path}`
  }

  return `${API_BASE}/${path}`
}

export function streamUrl(mediaId: string): string {
  // Stay on wetaccess so Bunny Referer gates can be satisfied by our HLS proxy.
  // Direct links to wet3.click/api/stream-v2 fail when Referer is wetaccess (403).
  return `${API_BASE}/api/stream-v2/${encodeURIComponent(mediaId)}`
}

/** HLS watch page (open in a new tab) — avoids dumping wet3 "Proxy Error" text. */
export function watchUrl(mediaId: string): string {
  return `#/watch/${encodeURIComponent(mediaId)}`
}

export function imageUrl(mediaId: string): string {
  return wet3AssetUrl(`/api/image/${mediaId}`)
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
    return wet3AssetUrl(item.webp_thumb)
  }

  // AAF CDN thumbs need signed cookies now — use wet3 /api/image instead.
  if (item.path.includes('allaccessfans.co')) {
    return imageUrl(item.id)
  }

  if (item.path.match(/\.(jpe?g|png|webp|gif)$/i)) {
    return wet3AssetUrl(item.path)
  }

  return imageUrl(item.id)
}

export function placeholderImage(): string {
  return `${API_BASE}/blog-placeholder-3.jpg`
}

/** Recover a publish/upload date from wet3/AAF/YouFanly asset paths. */
export function extractMediaDate(path: string | null | undefined): string | null {
  if (!path) {
    return null
  }

  const aafDate = path.match(/\/video\/(\d{4}-\d{2}-\d{2})\//)
  if (aafDate) {
    return aafDate[1]
  }

  const isoDate = path.match(/(?:^|[/_-])(\d{4}-\d{2}-\d{2})(?:[/_-]|$)/)
  if (isoDate) {
    return isoDate[1]
  }

  const uploadMs = path.match(/upload-\d+-(\d{13})(?:\b|$)/)
  if (uploadMs) {
    const date = new Date(Number(uploadMs[1]))
    if (!Number.isNaN(date.getTime())) {
      return date.toISOString().slice(0, 10)
    }
  }

  const uploadSec = path.match(/upload-\d+-(\d{10})(?:\b|$)/)
  if (uploadSec) {
    const date = new Date(Number(uploadSec[1]) * 1000)
    if (!Number.isNaN(date.getTime())) {
      return date.toISOString().slice(0, 10)
    }
  }

  return null
}

function mediaSortKey(id: string, createdAt: string | null): number {
  const numericId = Number(id)
  if (Number.isFinite(numericId)) {
    // Wet3/AAF media IDs trend upward with recency — best catalog order signal.
    return numericId
  }

  if (createdAt) {
    const fromDate = Date.parse(`${createdAt}T12:00:00.000Z`)
    if (!Number.isNaN(fromDate)) {
      return fromDate
    }
  }

  const yfStamp = id.match(/(\d{10,13})$/)
  if (yfStamp) {
    const raw = Number(yfStamp[1])
    return raw > 1e12 ? raw : raw * 1000
  }

  return 0
}

export function enrichMediaItem(
  item: Omit<MediaItem, 'createdAt' | 'sortKey'> &
    Partial<Pick<MediaItem, 'createdAt' | 'sortKey'>>,
): MediaItem {
  const createdAt = item.createdAt ?? extractMediaDate(item.path)
  return {
    ...item,
    createdAt,
    sortKey: item.sortKey ?? mediaSortKey(item.id, createdAt),
  }
}

export function sortMediaNewestFirst(items: MediaItem[]): MediaItem[] {
  return [...items].sort((a, b) => {
    if (b.sortKey !== a.sortKey) {
      return b.sortKey - a.sortKey
    }
    return b.id.localeCompare(a.id, undefined, { numeric: true })
  })
}

export function formatMediaDate(createdAt: string | null): string {
  if (!createdAt) {
    return 'Unknown date'
  }

  const date = new Date(`${createdAt}T12:00:00.000Z`)
  if (Number.isNaN(date.getTime())) {
    return createdAt
  }

  return new Intl.DateTimeFormat(undefined, {
    year: 'numeric',
    month: 'short',
    day: 'numeric',
  }).format(date)
}

type ForYouDurationItem = {
  id: string
  streamUrl: string
}

function decodeStreamTokenPlaylist(streamPageUrl: string): string | null {
  try {
    const url = new URL(streamPageUrl, WET3_ORIGIN)
    const token = url.searchParams.get('token')

    if (!token) {
      return null
    }

    const payloadPart = token.split('.')[0]

    if (!payloadPart) {
      return null
    }

    const padded = payloadPart
      .replace(/-/g, '+')
      .replace(/_/g, '/')
      .padEnd(Math.ceil(payloadPart.length / 4) * 4, '=')

    const payload = JSON.parse(atob(padded)) as { u?: string }

    if (typeof payload.u === 'string' && payload.u.includes('.m3u8')) {
      return payload.u
    }

    return null
  } catch {
    return null
  }
}

async function readClientPlaylistDuration(
  playlistUrl: string,
  depth = 0,
): Promise<number | null> {
  if (depth > 4) {
    return null
  }

  const response = await fetch(playlistUrl)

  if (!response.ok) {
    return null
  }

  const playlistText = await response.text()

  if (!playlistText.includes('#EXTM3U')) {
    return null
  }

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
    return readClientPlaylistDuration(new URL(variantLine, response.url).href, depth + 1)
  }

  return null
}

async function fetchVideoDurationFromStreamV2(mediaId: string): Promise<number | null> {
  const response = await fetch(`${API_BASE}/api/stream-v2/${encodeURIComponent(mediaId)}`, {
    redirect: 'manual',
  })

  let playlistUrl: string | null = null

  if (response.status >= 300 && response.status < 400) {
    const location = response.headers.get('location')
    if (location) {
      // /api/hls-proxy is same-origin (not under /wet3-api). wet3 relative
      // paths like /api/stream-v2/proxy.m3u8 stay on the wet3-api proxy.
      if (location.startsWith('http')) {
        playlistUrl = location
      } else if (
        location.startsWith('/api/hls-proxy') ||
        location.startsWith('/wet3-api/')
      ) {
        playlistUrl = location
      } else if (location.startsWith('/')) {
        playlistUrl = `${API_BASE}${location}`
      } else {
        playlistUrl = `${API_BASE}/${location}`
      }
    }
  } else if (response.ok) {
    playlistUrl = response.url
  }

  if (!playlistUrl) {
    return null
  }

  return readClientPlaylistDuration(playlistUrl)
}

async function fetchVideoDurationFromProxy(mediaId: string): Promise<number | null> {
  const fromStreamV2 = await fetchVideoDurationFromStreamV2(mediaId)
  if (fromStreamV2 !== null) {
    return fromStreamV2
  }

  const forYouResponse = await fetch(`${API_BASE}/api/for-you`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ startId: mediaId, limit: 24 }),
  })

  if (!forYouResponse.ok) {
    return null
  }

  const data = (await forYouResponse.json()) as { items?: ForYouDurationItem[] }
  const item = data.items?.find((entry) => entry.id === mediaId)

  if (!item?.streamUrl) {
    return null
  }

  const streamPageUrl = item.streamUrl.startsWith('http')
    ? item.streamUrl
    : `${WET3_ORIGIN}${item.streamUrl}`

  const playlistFromToken = decodeStreamTokenPlaylist(streamPageUrl)

  if (playlistFromToken) {
    return readClientPlaylistDuration(playlistFromToken)
  }

  const streamResponse = await fetch(
    item.streamUrl.startsWith('http') ? item.streamUrl : `${API_BASE}${item.streamUrl}`,
    { redirect: 'follow' },
  )

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
    const response = await fetch(`/api/duration?id=${encodeURIComponent(mediaId)}`)
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

  const data = JSON.parse(raw) as Array<Omit<MediaItem, 'createdAt' | 'sortKey'>>

  if (!Array.isArray(data)) {
    throw new Error('Profile media payload was invalid')
  }

  return sortMediaNewestFirst(data.map((item) => enrichMediaItem(item)))
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

export function dropThumbnailUrl(path: string | null | undefined): string {
  if (!path) {
    return placeholderImage()
  }

  if (path.startsWith('http://') || path.startsWith('https://') || path.startsWith('/')) {
    return wet3AssetUrl(path)
  }

  // Bare filenames occasionally appear in the catalog.
  return wet3AssetUrl(`/media/${path}`)
}

export function dropItemIsVideo(item: DropItem): boolean {
  if (item.duration?.trim()) {
    return true
  }

  // YouFanly drop IDs often resolve via stream-v2 as still images.
  if (item.id.startsWith('yf_')) {
    return false
  }

  // AAF still packs use numeric IDs with empty duration (stream-v2 → /image/…jpg).
  if (/^\d+$/.test(item.id)) {
    return false
  }

  const thumb = item.thumbnail ?? ''
  if (thumb.includes('/previews/')) {
    return true
  }

  // Packs are mostly video; only treat clear static thumbs as images.
  if (thumb && /\.(jpe?g|png|gif)$/i.test(thumb) && !thumb.includes('_thumb')) {
    return false
  }

  return true
}

export function dropItemCount(drop: Drop): number {
  if (Array.isArray(drop.items)) {
    return drop.items.length
  }

  if (typeof drop.items_count === 'number') {
    return drop.items_count
  }

  return 0
}

export function dropItemThumbnailUrl(item: DropItem): string {
  const thumb = item.thumbnail ?? ''
  if (thumb && !thumb.includes('blog-placeholder')) {
    // Absolute AAF CDN thumbs often 403 (CloudFront MissingKey) — prefer wet3 previews.
    if (thumb.includes('allaccessfans.co')) {
      return imageUrl(item.id)
    }
    return wet3AssetUrl(thumb)
  }

  // YF pack stills + AAF stills: stream-v2 resolves to a JPEG (via proxy rewrite).
  if (item.id.startsWith('yf_') || (!item.duration?.trim() && /^\d+$/.test(item.id))) {
    return imageUrl(item.id)
  }

  // Prefer wet3 preview path — /api/image/{id} 404s for many drop media IDs.
  return wet3AssetUrl(`/previews/${encodeURIComponent(item.id)}.webp`)
}

export function dropItemOpenUrl(item: DropItem): string {
  if (dropItemIsVideo(item)) {
    return watchUrl(item.id)
  }

  // YF / AAF stills: stream-v2 or /api/image resolves to a JPEG.
  if (item.id.startsWith('yf_') || /^\d+$/.test(item.id)) {
    return imageUrl(item.id)
  }

  return streamUrl(item.id)
}

export function formatDropRelease(releaseAt: string | null | undefined): string {
  if (!releaseAt) {
    return 'Unknown release'
  }

  const date = new Date(releaseAt)
  if (Number.isNaN(date.getTime())) {
    return releaseAt
  }

  return new Intl.DateTimeFormat(undefined, {
    year: 'numeric',
    month: 'short',
    day: 'numeric',
  }).format(date)
}

export function invalidateDropsClientCache() {
  dropsCache = null
  dropsInflight = null
  try {
    sessionStorage.removeItem('wetaccess:dropsSlim')
    sessionStorage.removeItem('wetaccess:dropsSlimAt')
  } catch {
    // ignore
  }
}

function slimDropForList(drop: Drop): Drop {
  const itemsCount = Array.isArray(drop.items)
    ? drop.items.length
    : typeof drop.items_count === 'number'
      ? drop.items_count
      : 0
  const { items: _items, ...rest } = drop
  return { ...rest, items_count: itemsCount }
}

function readSessionDrops(): Drop[] | null {
  try {
    const at = Number(sessionStorage.getItem('wetaccess:dropsSlimAt') || 0)
    if (!at || Date.now() - at > 5 * 60 * 1000) {
      return null
    }
    const raw = sessionStorage.getItem('wetaccess:dropsSlim')
    if (!raw) {
      return null
    }
    const parsed = JSON.parse(raw) as Drop[]
    return Array.isArray(parsed) ? parsed : null
  } catch {
    return null
  }
}

function writeSessionDrops(drops: Drop[]) {
  try {
    sessionStorage.setItem('wetaccess:dropsSlim', JSON.stringify(drops.map(slimDropForList)))
    sessionStorage.setItem('wetaccess:dropsSlimAt', String(Date.now()))
  } catch {
    // quota — ignore
  }
}

async function fetchWet3DropsRaw(): Promise<Drop[]> {
  // Use our slim /api/drops (HTML scrape) — wet3 /api/drops is multi‑MB and often times out.
  const response = await fetch('/api/drops')

  if (!response.ok) {
    throw new Error(`Drops request failed (${response.status})`)
  }

  const data = (await response.json()) as DropsResponse
  return Array.isArray(data.drops) ? data.drops : []
}

export async function fetchDrops(force = false): Promise<Drop[]> {
  if (!force && dropsCache) {
    return dropsCache
  }

  if (!force) {
    const session = readSessionDrops()
    if (session?.length) {
      dropsCache = session
      return session
    }
  }

  if (!force && dropsInflight) {
    return dropsInflight
  }

  dropsInflight = (async () => {
    const raw = await fetchWet3DropsRaw()
    const drops = raw.map(slimDropForList)
    dropsCache = drops
    writeSessionDrops(drops)
    return drops
  })()

  try {
    return await dropsInflight
  } finally {
    dropsInflight = null
  }
}

export type DropUnlockProgress = {
  phase: 'loading' | 'unlocking' | 'refreshing' | 'done'
  clickCount: number
  requiredClicks: number
}

/**
 * Farm community clicks + resolve pack items via our /api/drop handler
 * (scrapes wet3 /drops HTML — wet3's JSON catalog is too large/slow).
 */
export async function unlockAndFetchDrop(
  dropId: number,
  onProgress?: (progress: DropUnlockProgress) => void,
): Promise<Drop | null> {
  onProgress?.({ phase: 'loading', clickCount: 0, requiredClicks: 0 })

  const catalog = await fetchDrops()
  const listed = catalog.find((row) => row.id === dropId) ?? null
  onProgress?.({
    phase: listed && !listed.unlocked ? 'unlocking' : 'refreshing',
    clickCount: listed?.click_count ?? 0,
    requiredClicks: listed?.required_clicks ?? 0,
  })

  const response = await fetch(`/api/drop?id=${encodeURIComponent(String(dropId))}`)
  if (!response.ok) {
    throw new Error(`Drop resolve failed (${response.status})`)
  }

  const data = (await response.json()) as {
    drop?: Drop
    unlockedNow?: boolean
  }
  const drop = data.drop ?? null

  if (drop) {
    dropsCache = catalog.map((row) =>
      row.id === drop.id
        ? slimDropForList({
            ...row,
            unlocked: drop.unlocked,
            click_count: drop.click_count,
            required_clicks: drop.required_clicks,
            items_count: drop.items_count ?? dropItemCount(drop),
          })
        : row,
    )
    writeSessionDrops(dropsCache)
  }

  onProgress?.({
    phase: 'done',
    clickCount: drop?.click_count ?? listed?.click_count ?? 0,
    requiredClicks: drop?.required_clicks ?? listed?.required_clicks ?? 0,
  })

  return drop
}

export async function fetchDrop(
  dropId: number,
  options: { unlock?: boolean; force?: boolean } = {},
): Promise<Drop | null> {
  if (options.unlock === false) {
    const drops = await fetchDrops(options.force)
    return drops.find((drop) => drop.id === dropId) ?? null
  }

  return unlockAndFetchDrop(dropId)
}

export async function fetchUserMedia(username: string): Promise<MediaItem[]> {
  // Full catalog lives on paginated /api/profile (≈9/page). SSR mediaJson is
  // often "[]" or a short embed — use it only as a supplement/fallback.
  let fromApi: MediaItem[] = []
  try {
    fromApi = await fetchUserMediaFromProfileApi(username)
  } catch {
    fromApi = []
  }

  if (fromApi.length > 0) {
    return fromApi
  }

  const response = await fetch(`${API_BASE}/user/${encodeURIComponent(username)}`)

  if (!response.ok) {
    throw new Error(`Profile request failed (${response.status})`)
  }

  const html = await response.text()

  const isChallengeShell =
    html.includes('Security Check - Wet3') ||
    (html.includes('Security Check') && !html.includes('mediaJson'))

  if (!isChallengeShell && html.includes('mediaJson')) {
    try {
      const fromHtml = parseMediaJson(html)
      if (fromHtml.length > 0) {
        return fromHtml
      }
    } catch {
      // fall through
    }
  }

  if (isChallengeShell) {
    throw new Error(
      'wet3 Turnstile blocked /user/{username} (no mediaJson). Restart the Vite proxy so it injects wet3_user_id.',
    )
  }

  throw new Error('No mediaJson in profile HTML and /api/profile returned 0 items')
}

type ProfileApiMediaRow = {
  id: string
  path?: string | null
  isVideo?: number | boolean
  username?: string
  webp_thumb?: string | null
  src?: string
}

function mapProfileApiRows(
  rows: ProfileApiMediaRow[],
  username: string,
): MediaItem[] {
  return rows.map((row) => {
    const isVideo = row.isVideo === 1 || row.isVideo === true
    return enrichMediaItem({
      id: String(row.id),
      media_type: isVideo ? '2' : '1',
      src: row.src ?? 'aa',
      path: row.path ?? '',
      username: row.username ?? username,
      webp_thumb: row.webp_thumb ?? null,
    })
  })
}

/**
 * `/api/profile/{user}` returns ~9 items per page. Walk pages until empty
 * (pridevips: 98 across 11 pages; page 12 = []).
 */
async function fetchUserMediaFromProfileApi(username: string): Promise<MediaItem[]> {
  const slug = username.toLowerCase()
  const byId = new Map<string, MediaItem>()
  const maxPages = 100

  for (let page = 1; page <= maxPages; page += 1) {
    const response = await fetch(
      `${API_BASE}/api/profile/${encodeURIComponent(slug)}?page=${page}`,
    )

    if (!response.ok) {
      if (page === 1) {
        throw new Error(`Profile API failed (${response.status})`)
      }
      break
    }

    const data = (await response.json()) as { media?: ProfileApiMediaRow[] }
    const rows = data.media ?? []

    if (rows.length === 0) {
      break
    }

    let added = 0
    for (const item of mapProfileApiRows(rows, username)) {
      if (!byId.has(item.id)) {
        byId.set(item.id, item)
        added += 1
      }
    }

    // Same page repeating / wrap — stop.
    if (added === 0) {
      break
    }
  }

  return sortMediaNewestFirst([...byId.values()])
}
