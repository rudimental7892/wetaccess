import { randomUUID } from 'node:crypto'

type VercelRequest = {
  method?: string
  query: Record<string, string | string[] | undefined>
}

type VercelResponse = {
  status: (code: number) => VercelResponse
  setHeader: (name: string, value: string) => void
  json: (body: unknown) => void
  end: (body?: string) => void
}

export const config = {
  maxDuration: 30,
}

type FeedItem = {
  id: string
  username: string
  thumbnail: string
  streamUid: string
  duration: string
  locked: boolean
  hasNewDrop: boolean
}

const WET3_ORIGIN = 'https://wet3.click'
const BUNNY_CDN = 'vz-2fede3fd-af5.b-cdn.net'

function guestHeaders(): Record<string, string> {
  return {
    'User-Agent':
      'Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) AppleWebKit/537.36 (compatible; wetaccess-feed/1.0)',
    Accept: 'text/html,application/json,text/plain,*/*',
    Referer: `${WET3_ORIGIN}/`,
    Origin: WET3_ORIGIN,
    Cookie: `wet3_user_id=${randomUUID()}`,
  }
}

function parseFeedCard(block: string): FeedItem | null {
  const postMatch = block.match(/href="\/p\/(\d+)"/)
  if (!postMatch) return null
  const id = postMatch[1]

  const imgMatch = block.match(/src="(https?:\/\/[^"]+)"/)
  const thumbnail = imgMatch ? imgMatch[1] : ''

  let streamUid = ''
  const uidMatch = thumbnail.match(
    new RegExp(`${BUNNY_CDN.replace(/\./g, '\\.')}/([0-9a-f-]{36})/`),
  )
  if (uidMatch) {
    streamUid = uidMatch[1]
  }

  const userMatch = block.match(/href="\/user\/([^"]+)"/)
  const username = userMatch ? userMatch[1].trim() : ''

  const durMatch = block.match(
    /<span>(\d+:\d{2}(?::\d{2})?)<\/span>/,
  )
  const duration = durMatch ? durMatch[1] : ''

  const locked = block.includes('Locked')
  const hasNewDrop = block.includes('New Drop')

  return { id, username, thumbnail, streamUid, duration, locked, hasNewDrop }
}

function parseFeedHtml(html: string): FeedItem[] {
  const marker = '<!-- 3-Column Home Media Grid Card -->'
  const items: FeedItem[] = []
  const seen = new Set<string>()
  let from = 0

  while (from < html.length) {
    const idx = html.indexOf(marker, from)
    if (idx < 0) break

    const nextIdx = html.indexOf(marker, idx + marker.length)
    const end = nextIdx >= 0 ? nextIdx : html.length
    const block = html.slice(idx, end)

    const item = parseFeedCard(block)
    if (item && !seen.has(item.id)) {
      seen.add(item.id)
      items.push(item)
    }

    from = idx + marker.length
  }

  return items
}

async function fetchFeedPage(page: number) {
  const p = Math.max(1, Math.floor(page))

  const response = await fetch(`${WET3_ORIGIN}/api/feed?page=${p}`, {
    headers: guestHeaders(),
    redirect: 'follow',
  })

  if (!response.ok) {
    throw new Error(`wet3 feed page ${p} failed (${response.status})`)
  }

  const html = await response.text()
  const items = parseFeedHtml(html)

  return {
    page: p,
    items,
    hasMore: items.length >= 18,
  }
}

export default async function handler(req: VercelRequest, res: VercelResponse) {
  if ((req.method ?? 'GET').toUpperCase() !== 'GET') {
    res.status(405).json({ error: 'method not allowed' })
    return
  }

  const pageRaw = Array.isArray(req.query.page) ? req.query.page[0] : req.query.page
  const page = Math.max(1, Number.parseInt(pageRaw ?? '1', 10) || 1)

  try {
    const result = await fetchFeedPage(page)
    res.status(200)
    res.setHeader('cache-control', 'public, s-maxage=30, stale-while-revalidate=120')
    res.setHeader('content-type', 'application/json; charset=utf-8')
    res.end(JSON.stringify({ success: true, ...result }))
  } catch (error) {
    res.status(502).json({
      error: 'feed failed',
      detail: error instanceof Error ? error.message : String(error),
    })
  }
}
