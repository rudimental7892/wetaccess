import { randomUUID } from 'node:crypto'

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

export type SlimDrop = Omit<Drop, 'items'> & { items_count: number }

type ClickResponse = {
  success?: boolean
  click_count?: number
  required_clicks?: number
  unlocked?: boolean
  duplicate?: boolean
  error?: string
}

const WET3_ORIGIN = 'https://wet3.click'
const CACHE_TTL_MS = 45_000
const CLICK_BATCH = 8

let fullCache: { at: number; drops: Drop[] } | null = null
let slimCache: { at: number; drops: SlimDrop[] } | null = null

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
  const idMatch = block.match(/id="drop-card-(\d+)"/)
  if (!idMatch) return null
  const id = Number.parseInt(idMatch[1], 10)
  if (!Number.isFinite(id) || id <= 0) return null

  const clickAttr = block.match(
    /@click="activeDropId\s*=\s*(\d+);\s*activeDropUsername\s*=\s*'([^']*)';\s*activeDropClicks\s*=\s*(\d+);\s*activeDropReqClicks\s*=\s*(\d+);\s*activeDropNgnPrice\s*=\s*(\d+);\s*activeDropUsdPrice\s*=\s*'([^']*)';\s*dropsModalOpen\s*=\s*true;"/,
  )

  const username = clickAttr ? clickAttr[2] : ''
  const clickCount = clickAttr ? Number.parseInt(clickAttr[3], 10) : 0
  const requiredClicks = clickAttr ? Number.parseInt(clickAttr[4], 10) : 0

  const unlocked = clickCount >= requiredClicks && requiredClicks > 0

  const releaseMatch = block.match(/data-release-at="([^"]+)"/)
  const releaseAt = releaseMatch ? releaseMatch[1] : ''

  const clicks = block.match(/(\d+)\s*\/\s*(\d+)\s*clicks/i)
  const finalClickCount = clicks ? Number.parseInt(clicks[1], 10) : clickCount
  const finalReqClicks = clicks ? Number.parseInt(clicks[2], 10) : requiredClicks

  const itemsMeta = block.match(/(\d+)\s*items?/i)
  let itemsCount = itemsMeta ? Number.parseInt(itemsMeta[1], 10) : 0

  const thumbMatch = block.match(/src="(\/previews\/[^"]+)"/i)
    ?? block.match(/<img[^>]+src="([^"]+)"/i)
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
    display_name: username,
    title: username,
    thumbnail,
    release_at: releaseAt,
    required_clicks: finalReqClicks,
    click_count: finalClickCount,
    unlocked,
    is_early_unlocked: false,
    time_passed: unlocked,
    items_count: itemsCount,
    items: items.length > 0 ? items : undefined,
  }
}

function parseDropsFromHtml(html: string): Drop[] {
  const starts: number[] = []
  const marker = '<div id="drop-card-'
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

export function invalidateDropsCache() {
  fullCache = null
  slimCache = null
}

export async function fetchWet3DropsFull(force = false): Promise<Drop[]> {
  if (!force && fullCache && Date.now() - fullCache.at < CACHE_TTL_MS) {
    return fullCache.drops
  }

  // Prefer the SSR /drops page — wet3 /api/drops is multi-MB and often hangs.
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

export async function fetchSlimDrops(force = false): Promise<SlimDrop[]> {
  if (!force && slimCache && Date.now() - slimCache.at < CACHE_TTL_MS) {
    return slimCache.drops
  }

  const drops = await fetchWet3DropsFull(force)
  return drops.map(toSlim)
}

async function postDropClick(dropId: number): Promise<ClickResponse> {
  const response = await fetch(`${WET3_ORIGIN}/api/drops/click`, {
    method: 'POST',
    headers: guestHeaders({ 'Content-Type': 'application/json' }),
    body: JSON.stringify({ drop_id: dropId }),
  })

  const text = await response.text()
  try {
    return JSON.parse(text) as ClickResponse
  } catch {
    // wet3 now returns HTML instead of JSON — parse click state from the rendered card
    const clickMatch = text.match(/activeDropClicks\s*=\s*(\d+);\s*activeDropReqClicks\s*=\s*(\d+)/)
    if (clickMatch) {
      const clickCount = Number.parseInt(clickMatch[1], 10)
      const reqClicks = Number.parseInt(clickMatch[2], 10)
      return {
        click_count: clickCount,
        required_clicks: reqClicks,
        unlocked: clickCount >= reqClicks && reqClicks > 0,
      }
    }
    return { success: true }
  }
}

export async function farmDropUnlock(dropId: number, drop: Drop): Promise<ClickResponse | null> {
  if (drop.unlocked) {
    return null
  }

  const required = Math.max(0, drop.required_clicks - drop.click_count)
  let remaining = Math.min(80, required + 3)
  let last: ClickResponse | null = null

  while (remaining > 0) {
    const batchSize = Math.min(CLICK_BATCH, remaining)
    const batch = await Promise.all(
      Array.from({ length: batchSize }, () => postDropClick(dropId)),
    )

    remaining -= batchSize
    last = batch[batch.length - 1] ?? last

    if (batch.some((row) => row.unlocked)) {
      invalidateDropsCache()
      return batch.find((row) => row.unlocked) ?? last
    }

    const maxCount = Math.max(
      drop.click_count,
      ...batch.map((row) => row.click_count ?? 0),
    )
    if (maxCount >= drop.required_clicks) {
      invalidateDropsCache()
      return last
    }
  }

  invalidateDropsCache()
  return last
}

export async function resolveDrop(
  dropId: number,
  options: { unlock?: boolean } = {},
): Promise<{ drop: Drop | null; unlockedNow: boolean; click?: ClickResponse | null }> {
  const unlock = options.unlock !== false
  let drops = await fetchWet3DropsFull()
  let drop = drops.find((row) => row.id === dropId) ?? null

  if (!drop) {
    return { drop: null, unlockedNow: false }
  }

  if (drop.unlocked && Array.isArray(drop.items) && drop.items.length > 0) {
    return { drop, unlockedNow: false }
  }

  if (!unlock) {
    return { drop, unlockedNow: false }
  }

  const click = await farmDropUnlock(dropId, drop)
  drops = await fetchWet3DropsFull(true)
  drop = drops.find((row) => row.id === dropId) ?? drop

  return {
    drop,
    unlockedNow: Boolean(drop?.unlocked),
    click,
  }
}
