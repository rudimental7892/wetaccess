/**
 * Wet3 serves /api/creators as HTMX HTML tiles (not JSON).
 *
 * Shape change (2026-08):
 * - Pagination is infinite HTMX (page=2,3,4… continues for many pages).
 * - Search is NOT server-side: each tile has Alpine
 *   `x-show="!search || 'username'.includes(search.toLowerCase())"`.
 *   Query params `search=` are ignored by wet3 — always returns that page's tiles.
 * - @wet3 with ~7k+ uploads is a real first-row creator, not a parse bug.
 */

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
  /** Wet3 has another HTMX page after this one */
  hasMore: boolean
  /** How results were produced */
  mode?: 'page' | 'search-scan'
  note?: string
}

const WET3_ORIGIN = 'https://wet3.click'

/** Sticky guest cookie — reuse across scrapes in this process (bot-safer than new UUID every call). */
let stickyGuestCookie: string | null = null
let stickyGuestAt = 0
const STICKY_TTL_MS = 45 * 60 * 1000

function guestCookie(): string {
  const now = Date.now()
  if (!stickyGuestCookie || now - stickyGuestAt > STICKY_TTL_MS) {
    stickyGuestCookie = `wet3_user_id=${cryptoRandom()}`
    stickyGuestAt = now
  }
  return stickyGuestCookie
}

/** Robust tile parse — split on each /user/ href (wet3 adds Alpine x-show attrs). */
export function parseCreatorsHtml(html: string): Creator[] {
  const items: Creator[] = []
  const seen = new Set<string>()
  const parts = html.split(/(?=href="\/user\/)/i)

  for (const part of parts) {
    const um = part.match(/href="\/user\/([^"?#]+)"/i)
    if (!um) continue
    const username = decodeURIComponent(um[1].trim())
    if (!username || seen.has(username)) continue
    if (username.includes('/') || username.includes(' ')) continue
    seen.add(username)

    const img =
      part.match(/<img[^>]+src="([^"]+)"/i)?.[1] ??
      part.match(/src="(\/media\/[^"]+|\/favicon[^"]*|https?:\/\/[^"]+)"/i)?.[1] ??
      '/favicon.svg'
    const uploadsRaw =
      part.match(/(\d[\d,]*)\s*uploads/i)?.[1]?.replace(/,/g, '') ?? '0'
    const display =
      part.match(/@([a-zA-Z0-9_.-]+)/)?.[1] ?? username

    items.push({
      u: username,
      d: display,
      ds: uploadsRaw,
      rs: Number(uploadsRaw) || 0,
      p: img,
      vn: '0',
      vi: '0',
    })
  }

  return items
}

function hasMorePages(html: string, page: number): boolean {
  const next = page + 1
  return (
    html.includes(`page=${next}`) ||
    new RegExp(`hx-get="[^"]*[?&]page=${next}(?:&|")`).test(html) ||
    new RegExp(`/api/creators\\?[^"]*page=${next}`).test(html)
  )
}

/** Match wet3 Alpine filter: username includes query (case-insensitive). */
export function creatorMatchesSearch(c: Creator, q: string): boolean {
  const needle = q.trim().toLowerCase()
  if (!needle) return true
  return (
    c.u.toLowerCase().includes(needle) ||
    c.d.toLowerCase().includes(needle)
  )
}

async function fetchCreatorsPageHtml(page: number): Promise<{ html: string; items: Creator[]; hasMore: boolean }> {
  const params = new URLSearchParams({
    page: String(page),
    limit: '30',
  })
  const url = `${WET3_ORIGIN}/api/creators?${params}`
  const response = await fetch(url, {
    method: 'GET',
    headers: {
      Accept: 'text/html,application/json;q=0.9,*/*;q=0.8',
      'User-Agent':
        'Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/131.0.0.0 Safari/537.36',
      Referer: `${WET3_ORIGIN}/`,
      Origin: WET3_ORIGIN,
      Cookie: guestCookie(),
      'HX-Request': 'true',
    },
    redirect: 'follow',
  })

  const html = await response.text()
  if (!response.ok) {
    throw new Error(`wet3 creators upstream ${response.status}: ${html.slice(0, 120)}`)
  }
  if (html.includes('Security Check') && !html.includes('href="/user/')) {
    throw new Error('wet3 Turnstile blocked creators feed')
  }

  const items = parseCreatorsHtml(html)
  return { html, items, hasMore: hasMorePages(html, page) && items.length > 0 }
}

function sleep(ms: number) {
  return new Promise((r) => setTimeout(r, ms))
}

// ---------------------------------------------------------------------------
// In-memory creator catalog cache (5-hour TTL, background refresh)
// ---------------------------------------------------------------------------
type CatalogCache = {
  /** All creators scraped across all origin pages */
  all: Creator[]
  /** When the cache was last refreshed (ms) */
  fetchedAt: number
  /** Whether a background refresh is currently running */
  refreshing: boolean
}

const CATALOG_TTL_MS = 5 * 60 * 60 * 1000 // 5 hours
let catalogCache: CatalogCache | null = null

async function scrapeFullCatalog(): Promise<Creator[]> {
  const all: Creator[] = []
  const seen = new Set<string>()
  const maxPages = 60

  for (let page = 1; page <= maxPages; page += 1) {
    if (page > 1) {
      await sleep(300 + Math.floor(Math.random() * 200))
    }
    try {
      const { items, hasMore } = await fetchCreatorsPageHtml(page)
      for (const c of items) {
        if (!seen.has(c.u)) {
          seen.add(c.u)
          all.push(c)
        }
      }
      if (!hasMore || items.length === 0) break
    } catch {
      break
    }
  }

  return all
}

function refreshCatalogInBackground() {
  if (catalogCache?.refreshing) return
  if (catalogCache) catalogCache.refreshing = true

  void scrapeFullCatalog()
    .then((all) => {
      if (all.length > 0) {
        catalogCache = { all, fetchedAt: Date.now(), refreshing: false }
      } else if (catalogCache) {
        catalogCache.refreshing = false
      }
    })
    .catch(() => {
      if (catalogCache) catalogCache.refreshing = false
    })
}

function getCatalog(): Creator[] | null {
  if (!catalogCache) return null
  if (Date.now() - catalogCache.fetchedAt > CATALOG_TTL_MS) {
    refreshCatalogInBackground()
  }
  return catalogCache.all
}

/**
 * Browse a single wet3 page (no search).
 * total is a soft lower-bound so UIs that only understand totalPages still allow Next.
 */
export async function fetchCreatorsFromWet3(options: {
  page: number
  limit: number
  search?: string
  twitterOnly?: boolean
}): Promise<CreatorsResponse> {
  const page = Math.max(1, options.page || 1)
  const limit = Math.max(1, Math.min(100, options.limit || 24))
  const search = options.search?.trim() ?? ''

  // twitterOnly is accepted for API compat; wet3 currently ignores it (same tiles).
  void options.twitterOnly

  // --- Try serving from the in-memory catalog cache first ---
  const cached = getCatalog()
  if (cached && cached.length > 0) {
    let pool = cached
    if (search) {
      pool = cached.filter((c) => creatorMatchesSearch(c, search))
    }
    const start = (page - 1) * limit
    const slice = pool.slice(start, start + limit)
    const hasMore = pool.length > start + limit

    return {
      items: slice,
      total: pool.length,
      page,
      limit,
      hasMore,
      mode: search ? 'search-scan' : 'page',
      note: search
        ? 'Filtered from cached catalog.'
        : undefined,
    }
  }

  // --- Search path: wet3 ignores ?search= (Alpine client filter only). ---
  // Bot-safe scan: sequential pages, 500–900ms gap, max 20 origin pages.
  if (search) {
    const maxScanPages = 20
    const matched: Creator[] = []
    const seen = new Set<string>()
    let wetPage = 1
    let originHasMore = true

    while (wetPage <= maxScanPages && originHasMore) {
      if (wetPage > 1) {
        await sleep(500 + Math.floor(Math.random() * 400))
      }
      const { items, hasMore } = await fetchCreatorsPageHtml(wetPage)
      originHasMore = hasMore
      for (const c of items) {
        if (seen.has(c.u)) continue
        seen.add(c.u)
        if (creatorMatchesSearch(c, search)) {
          matched.push(c)
        }
      }
      // Enough matches to fill this result page + peek next?
      if (matched.length >= page * limit + 1) {
        break
      }
      if (!hasMore || items.length === 0) {
        originHasMore = false
        break
      }
      wetPage += 1
    }

    const start = (page - 1) * limit
    const slice = matched.slice(start, start + limit)
    const hasMoreResults =
      matched.length > start + limit || (originHasMore && wetPage <= maxScanPages)

    return {
      items: slice,
      // Soft total: known matches + room if origin may still have more
      total: hasMoreResults
        ? Math.max(matched.length + limit, page * limit + limit)
        : matched.length,
      page,
      limit,
      hasMore: hasMoreResults,
      mode: 'search-scan',
      note:
        'wet3 search is client-side only; wetaccess scanned origin pages slowly and filtered usernames.',
    }
  }

  // --- Normal browse: one origin page ---
  const { items, hasMore } = await fetchCreatorsPageHtml(page)

  // Kick off a full catalog scrape in the background on the first browse request
  if (page === 1 && !catalogCache) {
    refreshCatalogInBackground()
  }

  // Soft total: never use "+1 only" (that capped UI at ~2 pages when limit=24, items=30).
  // When hasMore, claim enough total for many more pages; UI should prefer hasMore.
  const pageSize = Math.max(items.length, limit, 1)
  const total = hasMore
    ? Math.max(page * pageSize + pageSize * 20, (page + 20) * limit)
    : (page - 1) * pageSize + items.length

  return {
    items,
    total,
    page,
    limit,
    hasMore,
    mode: 'page',
  }
}

function cryptoRandom(): string {
  try {
    return globalThis.crypto?.randomUUID?.() ?? `g-${Date.now()}-${Math.random()}`
  } catch {
    return `g-${Date.now()}-${Math.random()}`
  }
}
