import { randomUUID } from 'node:crypto'

export type FeedItem = {
  id: string
  username: string
  thumbnail: string
  streamUid: string
  duration: string
  locked: boolean
  hasNewDrop: boolean
}

export type FeedPage = {
  page: number
  items: FeedItem[]
  hasMore: boolean
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

export function parseFeedHtml(html: string): FeedItem[] {
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

export async function fetchFeedPage(page: number): Promise<FeedPage> {
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
