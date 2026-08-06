/**
 * Wet3 now gates stream-v2 behind an ad completion token (`st=`).
 * Flow: get-monetized-link → ad-complete (skip countdown) → Location …?st=TOKEN
 * Then: GET /api/stream-v2/{id}?st=TOKEN → 302 Bunny playlist.
 */

const WET3_ORIGIN = 'https://wet3.click'

export async function obtainWet3StreamToken(
  mediaId: string,
  guestCookie?: string,
): Promise<string | null> {
  const cookie = guestCookie ?? `wet3_user_id=${cryptoRandom()}`
  const headers: Record<string, string> = {
    'User-Agent': 'Mozilla/5.0 (compatible; wetaccess-proxy/1.1)',
    Accept: '*/*',
    Referer: `${WET3_ORIGIN}/`,
    Origin: WET3_ORIGIN,
    Cookie: cookie,
  }

  const monetized = await fetch(
    `${WET3_ORIGIN}/api/get-monetized-link?id=${encodeURIComponent(mediaId)}&destination=player`,
    { method: 'GET', redirect: 'manual', headers },
  )

  const monetizedLoc = monetized.headers.get('location')
  if (!monetizedLoc) {
    return null
  }

  // Location is usually countdownto.today/api/monetize?url=<ad-complete url>&...
  let adCompleteUrl: string | null = null
  try {
    const abs = monetizedLoc.startsWith('http')
      ? monetizedLoc
      : new URL(monetizedLoc, WET3_ORIGIN).href
    const nested = new URL(abs).searchParams.get('url')
    if (nested?.includes('/api/ad-complete')) {
      adCompleteUrl = nested
    } else if (abs.includes('/api/ad-complete')) {
      adCompleteUrl = abs
    }
  } catch {
    return null
  }

  if (!adCompleteUrl) {
    return null
  }

  const complete = await fetch(adCompleteUrl, {
    method: 'GET',
    redirect: 'manual',
    headers: {
      ...headers,
      Referer: 'https://countdownto.today/',
    },
  })

  const playerLoc = complete.headers.get('location')
  if (!playerLoc) {
    return null
  }

  try {
    const playerUrl = playerLoc.startsWith('http')
      ? new URL(playerLoc)
      : new URL(playerLoc, WET3_ORIGIN)
    const st = playerUrl.searchParams.get('st')
    return st && st.length > 8 ? st : null
  } catch {
    return null
  }
}

export function streamV2UrlWithToken(mediaId: string, st: string | null): string {
  const base = `${WET3_ORIGIN}/api/stream-v2/${encodeURIComponent(mediaId)}`
  return st ? `${base}?st=${encodeURIComponent(st)}` : base
}

function cryptoRandom(): string {
  // Node 19+ / browsers
  try {
    return globalThis.crypto?.randomUUID?.() ?? `g-${Date.now()}-${Math.random()}`
  } catch {
    return `g-${Date.now()}-${Math.random()}`
  }
}
