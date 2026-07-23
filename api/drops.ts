import { randomUUID } from 'node:crypto'

type VercelRequest = {
  method?: string
}

type VercelResponse = {
  status: (code: number) => VercelResponse
  setHeader: (name: string, value: string) => void
  json: (body: unknown) => void
  end: (body?: string) => void
}

export const config = {
  maxDuration: 60,
  api: {
    responseLimit: false,
  },
}

type DropItem = {
  id: string
  duration: string
  price: string
  isDropExclusive: number
  thumbnail: string | null
  player_url: string
}

type Drop = {
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

type SlimDrop = Omit<Drop, 'items'> & { items_count: number }

const WET3_ORIGIN = 'https://wet3.click'
const CACHE_TTL_MS = 45_000

let slimCache: { at: number; drops: SlimDrop[] } | null = null
let fullCache: { at: number; drops: Drop[] } | null = null

function guestHeaders(extra?: Record<string, string>): Record<string, string> {
  return {
    'User-Agent':
      'Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) AppleWebKit/537.36 (compatible; wetaccess-drops/1.0)',
    Accept: 'text/html,application/json,text/plain,*/*',
    Referer: `${WET3_ORIGIN}/`,
    Origin: WET3_ORIGIN,
    Cookie: `wet3_user_id=${randomUUID()}`,
    ...extra,
  }
}

function decodeHtmlEntities(value: string): string {
  return value
    .replace(/&#38;/g, '&')
    .replace(/&amp;/g, '&')
    .replace(/&lt;/g, '<')
    .replace(/&gt;/g, '>')
    .replace(/&quot;/g, '"')
    .replace(/&#39;/g, "'")
}

function unwrapImageProxy(src: string): string {
  const decoded = decodeHtmlEntities(src)
  try {
    const url = new URL(decoded, WET3_ORIGIN)
    if (url.pathname.includes('/api/image/proxy')) {
      const nested = url.searchParams.get('url')
      if (nested) {
        return nested
      }
    }
  } catch {
    // fall through
  }
  return decoded
}

function attrFromOpenTag(openTag: string, name: string): string | null {
  const match = openTag.match(new RegExp(`${name}="([^"]*)"`, 'i'))
  return match ? decodeHtmlEntities(match[1]) : null
}

function parseDropCard(block: string): Drop | null {
  const openEnd = block.indexOf('>')
  if (openEnd < 0) return null
  const head = block.slice(0, openEnd + 1)

  const idRaw = attrFromOpenTag(head, 'data-drop-id')
  const id = Number.parseInt(idRaw ?? '', 10)
  if (!Number.isFinite(id) || id <= 0) {
    return null
  }

  const unlocked = /\bdrop-unlocked\b/.test(head)
  const username = attrFromOpenTag(head, 'data-username') ?? ''
  const title = attrFromOpenTag(head, 'data-title') ?? username
  const releaseAt = attrFromOpenTag(head, 'data-release-at') ?? ''

  const clicks = block.match(/(\d+)\s*\/\s*(\d+)\s*clicks/i)
  const clickCount = clicks ? Number.parseInt(clicks[1], 10) : 0
  const requiredClicks = clicks ? Number.parseInt(clicks[2], 10) : 0

  const itemsMeta = block.match(/(\d+)\s*items?/i)
  let itemsCount = itemsMeta ? Number.parseInt(itemsMeta[1], 10) : 0

  const thumbMatch =
    block.match(/class="drop-thumb"[^>]*src="([^"]+)"/i) ??
    block.match(/src="([^"]+)"[^>]*class="drop-thumb"/i)
  const thumbnail = thumbMatch ? unwrapImageProxy(thumbMatch[1]) : null

  const items: DropItem[] = []
  if (unlocked) {
    const linkRe =
      /href="(\/api\/get-monetized-link\?[^"]+)"[\s\S]{0,500}?src="([^"]+)"/gi
    let linkMatch: RegExpExecArray | null
    while ((linkMatch = linkRe.exec(block)) !== null) {
      const href = decodeHtmlEntities(linkMatch[1])
      let mediaId = ''
      try {
        mediaId = new URL(href, WET3_ORIGIN).searchParams.get('id') ?? ''
      } catch {
        mediaId = ''
      }
      if (!mediaId) continue
      items.push({
        id: mediaId,
        duration: '',
        price: 'Free',
        isDropExclusive: 1,
        thumbnail: unwrapImageProxy(linkMatch[2]),
        player_url: `/api/stream-v2/${encodeURIComponent(mediaId)}`,
      })
    }
    if (items.length > 0) {
      itemsCount = items.length
    }
  }

  return {
    id,
    username,
    display_name: title,
    title,
    thumbnail,
    release_at: releaseAt,
    required_clicks: requiredClicks,
    click_count: clickCount,
    unlocked,
    is_early_unlocked: false,
    time_passed: unlocked,
    items_count: itemsCount,
    items: items.length > 0 ? items : undefined,
  }
}

function parseDropsFromHtml(html: string): Drop[] {
  const starts: number[] = []
  const marker = '<div class="drop-card'
  let from = 0
  while (from < html.length) {
    const idx = html.indexOf(marker, from)
    if (idx < 0) break
    starts.push(idx)
    from = idx + marker.length
  }

  const drops: Drop[] = []
  const seen = new Set<number>()

  for (let i = 0; i < starts.length; i += 1) {
    const start = starts[i]
    const end = i + 1 < starts.length ? starts[i + 1] : Math.min(html.length, start + 16_000)
    const drop = parseDropCard(html.slice(start, end))
    if (drop && !seen.has(drop.id)) {
      seen.add(drop.id)
      drops.push(drop)
    }
  }

  return drops
}

function toSlim(drop: Drop): SlimDrop {
  const itemsCount = Array.isArray(drop.items)
    ? drop.items.length
    : typeof drop.items_count === 'number'
      ? drop.items_count
      : 0

  const { items: _items, ...rest } = drop
  return {
    ...rest,
    items_count: itemsCount,
  }
}

async function fetchDropsFromHtmlPage(force = false): Promise<Drop[]> {
  if (!force && fullCache && Date.now() - fullCache.at < CACHE_TTL_MS) {
    return fullCache.drops
  }

  const response = await fetch(`${WET3_ORIGIN}/drops`, {
    headers: guestHeaders(),
    redirect: 'follow',
  })

  if (!response.ok) {
    throw new Error(`wet3 drops page failed (${response.status})`)
  }

  const html = await response.text()
  const drops = parseDropsFromHtml(html)
  if (drops.length === 0) {
    throw new Error('wet3 drops page had no drop cards')
  }

  fullCache = { at: Date.now(), drops }
  slimCache = { at: Date.now(), drops: drops.map(toSlim) }
  return drops
}

async function fetchSlimDrops(force = false): Promise<SlimDrop[]> {
  if (!force && slimCache && Date.now() - slimCache.at < CACHE_TTL_MS) {
    return slimCache.drops
  }

  const drops = await fetchDropsFromHtmlPage(force)
  return drops.map(toSlim)
}

export default async function handler(req: VercelRequest, res: VercelResponse) {
  if ((req.method ?? 'GET').toUpperCase() !== 'GET') {
    res.status(405).json({ error: 'method not allowed' })
    return
  }

  try {
    const drops = await fetchSlimDrops()
    res.status(200)
    res.setHeader('cache-control', 'public, s-maxage=30, stale-while-revalidate=120')
    res.setHeader('content-type', 'application/json; charset=utf-8')
    res.end(JSON.stringify({ success: true, drops }))
  } catch (error) {
    res.status(502).json({
      error: 'drops catalog failed',
      detail: error instanceof Error ? error.message : String(error),
    })
  }
}
