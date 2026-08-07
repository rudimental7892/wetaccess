/**
 * Wet3 serves /api/creators as HTMX HTML tiles (not JSON).
 * Scrape once server-side so the SPA always gets stable JSON.
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
}

const WET3_ORIGIN = 'https://wet3.click'

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

export async function fetchCreatorsFromWet3(options: {
  page: number
  limit: number
  search?: string
  twitterOnly?: boolean
}): Promise<CreatorsResponse> {
  const page = Math.max(1, options.page || 1)
  const limit = Math.max(1, Math.min(100, options.limit || 24))
  const params = new URLSearchParams({
    page: String(page),
    limit: String(limit),
  })
  if (options.search?.trim()) params.set('search', options.search.trim())
  if (options.twitterOnly) params.set('twitterOnly', 'true')

  const url = `${WET3_ORIGIN}/api/creators?${params}`
  const response = await fetch(url, {
    method: 'GET',
    headers: {
      Accept: 'text/html,application/json;q=0.9,*/*;q=0.8',
      'User-Agent': 'Mozilla/5.0 (compatible; wetaccess-creators/1.1)',
      Referer: `${WET3_ORIGIN}/`,
      Origin: WET3_ORIGIN,
      Cookie: `wet3_user_id=${cryptoRandom()}`,
      'HX-Request': 'true',
    },
    redirect: 'follow',
  })

  const raw = await response.text()
  if (!response.ok) {
    throw new Error(`wet3 creators upstream ${response.status}: ${raw.slice(0, 120)}`)
  }

  const trimmed = raw.trimStart()
  if (trimmed.startsWith('{')) {
    try {
      const data = JSON.parse(raw) as CreatorsResponse
      if (Array.isArray(data.items)) {
        return {
          items: data.items,
          total: data.total ?? data.items.length,
          page: data.page ?? page,
          limit: data.limit ?? limit,
        }
      }
    } catch {
      // fall through
    }
  }

  if (raw.includes('Security Check') && !raw.includes('href="/user/')) {
    throw new Error('wet3 Turnstile blocked creators feed')
  }

  const items = parseCreatorsHtml(raw)
  const more = hasMorePages(raw, page)
  const total = more
    ? page * Math.max(items.length, limit) + 1
    : (page - 1) * Math.max(limit, 1) + items.length

  return { items, total, page, limit }
}

function cryptoRandom(): string {
  try {
    return globalThis.crypto?.randomUUID?.() ?? `g-${Date.now()}-${Math.random()}`
  } catch {
    return `g-${Date.now()}-${Math.random()}`
  }
}
