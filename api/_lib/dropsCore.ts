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
    Accept: 'application/json,text/plain,*/*',
    Referer: `${WET3_ORIGIN}/`,
    Origin: WET3_ORIGIN,
    Cookie: `wet3_user_id=${randomUUID()}`,
    ...extra,
  }
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

  const response = await fetch(`${WET3_ORIGIN}/api/drops`, {
    headers: guestHeaders(),
    redirect: 'follow',
  })

  if (!response.ok) {
    throw new Error(`wet3 drops failed (${response.status})`)
  }

  const data = (await response.json()) as { drops?: Drop[] }
  const drops = Array.isArray(data.drops) ? data.drops : []
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
    throw new Error(`drop click failed (${response.status})`)
  }
}

export async function farmDropUnlock(dropId: number, drop: Drop): Promise<ClickResponse | null> {
  if (drop.unlocked) {
    return null
  }

  const required = Math.max(0, drop.required_clicks - drop.click_count)
  // Extra attempts cover races / duplicates / delayed counters.
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

  if (drop.unlocked && Array.isArray(drop.items)) {
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
