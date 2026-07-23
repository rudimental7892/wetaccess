import { randomUUID } from 'node:crypto'

type VercelRequest = {
  method?: string
  query: Record<string, string | string[] | undefined>
}

type VercelResponse = {
  status: (code: number) => VercelResponse
  setHeader: (name: string, value: string) => void
  json: (body: unknown) => void
}

export const config = {
  maxDuration: 60,
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

type ClickResponse = {
  success?: boolean
  click_count?: number
  required_clicks?: number
  unlocked?: boolean
  duplicate?: boolean
  error?: string
}

const WET3_ORIGIN = 'https://wet3.click'
const CLICK_BATCH = 8

function queryString(value: string | string[] | undefined): string | undefined {
  return Array.isArray(value) ? value[0] : value
}

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

async function fetchDropsFromHtmlPage(): Promise<Drop[]> {
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
  return drops
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
    throw new Error(`drop click failed (${response.status})`)
  }
}

async function farmDropUnlock(dropId: number, drop: Drop): Promise<ClickResponse | null> {
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
      return batch.find((row) => row.unlocked) ?? last
    }

    const maxCount = Math.max(
      drop.click_count,
      ...batch.map((row) => row.click_count ?? 0),
    )
    if (maxCount >= drop.required_clicks) {
      return last
    }
  }

  return last
}

async function resolveDrop(
  dropId: number,
  options: { unlock?: boolean } = {},
): Promise<{ drop: Drop | null; unlockedNow: boolean; click?: ClickResponse | null }> {
  const unlock = options.unlock !== false
  let drops = await fetchDropsFromHtmlPage()
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
  drops = await fetchDropsFromHtmlPage()
  drop = drops.find((row) => row.id === dropId) ?? drop

  return {
    drop,
    unlockedNow: Boolean(drop?.unlocked),
    click,
  }
}

export default async function handler(req: VercelRequest, res: VercelResponse) {
  if ((req.method ?? 'GET').toUpperCase() !== 'GET') {
    res.status(405).json({ error: 'method not allowed' })
    return
  }

  const idRaw = queryString(req.query.id)
  const dropId = Number.parseInt(idRaw ?? '', 10)

  if (!Number.isFinite(dropId) || dropId <= 0) {
    res.status(400).json({ error: 'missing or invalid id' })
    return
  }

  const unlockParam = queryString(req.query.unlock)
  const unlock = unlockParam !== '0' && unlockParam !== 'false'

  try {
    const result = await resolveDrop(dropId, { unlock })

    if (!result.drop) {
      res.status(404).json({ error: 'drop not found' })
      return
    }

    res.status(200).json({
      success: true,
      unlockedNow: result.unlockedNow,
      drop: result.drop,
    })
  } catch (error) {
    res.status(502).json({
      error: 'drop resolve failed',
      detail: error instanceof Error ? error.message : String(error),
    })
  }
}
