type ForYouItem = {
  id: string
  streamUrl: string
  isVideo?: number
}

type StreamTokenPayload = {
  u?: string
  t?: string
}

function decodeStreamTokenPayload(token: string): StreamTokenPayload | null {
  try {
    const payloadPart = token.split('.')[0]

    if (!payloadPart) {
      return null
    }

    const padded = payloadPart
      .replace(/-/g, '+')
      .replace(/_/g, '/')
      .padEnd(Math.ceil(payloadPart.length / 4) * 4, '=')

    return JSON.parse(atob(padded)) as StreamTokenPayload
  } catch {
    return null
  }
}

export function extractPlaylistUrlFromStreamPage(streamPageUrl: string): string | null {
  try {
    const url = new URL(streamPageUrl, 'https://wet3.click')
    const token = url.searchParams.get('token')

    if (!token) {
      return null
    }

    const payload = decodeStreamTokenPayload(token)

    if (typeof payload?.u === 'string' && payload.u.includes('.m3u8')) {
      return payload.u
    }

    return null
  } catch {
    return null
  }
}

async function readPlaylistDuration(playlistUrl: string): Promise<number | null> {
  const response = await fetch(playlistUrl, { redirect: 'follow' })

  if (!response.ok) {
    return null
  }

  const playlistText = await response.text()

  if (!playlistText.includes('#EXTM3U')) {
    return null
  }

  const variantLine = playlistText
    .split('\n')
    .map((line) => line.trim())
    .find((line) => line && !line.startsWith('#'))

  if (variantLine?.includes('.m3u8')) {
    return readPlaylistDuration(new URL(variantLine, response.url).href)
  }

  const total = [...playlistText.matchAll(/#EXTINF:([\d.]+)/g)].reduce(
    (sum, match) => sum + Number.parseFloat(match[1]),
    0,
  )

  return total > 0 ? total : null
}

async function resolveStreamPlaylistUrl(streamPageUrl: string): Promise<string | null> {
  const fromToken = extractPlaylistUrlFromStreamPage(streamPageUrl)

  if (fromToken) {
    return fromToken
  }

  let currentUrl = streamPageUrl

  for (let hop = 0; hop < 6; hop += 1) {
    const response = await fetch(currentUrl, { redirect: 'manual' })

    if (response.status >= 300 && response.status < 400) {
      const location = response.headers.get('location')

      if (!location) {
        return null
      }

      currentUrl = new URL(location, currentUrl).href

      if (currentUrl.includes('.m3u8')) {
        return currentUrl
      }

      continue
    }

    if (!response.ok) {
      return null
    }

    const contentType = response.headers.get('content-type') ?? ''
    const body = await response.text()

    if (
      contentType.includes('mpegurl') ||
      contentType.includes('m3u8') ||
      body.startsWith('#EXTM3U')
    ) {
      return response.url
    }

    return null
  }

  return null
}

async function fetchForYouStreamUrl(mediaId: string): Promise<string | null> {
  const forYouResponse = await fetch('https://wet3.click/api/for-you', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ startId: mediaId, limit: 24 }),
  })

  if (!forYouResponse.ok) {
    return null
  }

  const data = (await forYouResponse.json()) as { items?: ForYouItem[] }
  const item = data.items?.find((entry) => entry.id === mediaId)

  if (!item?.streamUrl) {
    return null
  }

  return item.streamUrl.startsWith('http')
    ? item.streamUrl
    : `https://wet3.click${item.streamUrl}`
}

export async function fetchWet3VideoDuration(mediaId: string): Promise<number | null> {
  const streamPageUrl = await fetchForYouStreamUrl(mediaId)

  if (!streamPageUrl) {
    return null
  }

  const playlistUrl = await resolveStreamPlaylistUrl(streamPageUrl)

  if (!playlistUrl) {
    return null
  }

  return readPlaylistDuration(playlistUrl)
}
