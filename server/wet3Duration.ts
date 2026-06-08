import type { Connect } from 'vite'

type ForYouItem = {
  id: string
  streamUrl: string
}

async function readPlaylistDuration(playlistUrl: string): Promise<number | null> {
  const response = await fetch(playlistUrl, { redirect: 'follow' })

  if (!response.ok) {
    return null
  }

  const playlistText = await response.text()
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

export async function fetchWet3VideoDuration(mediaId: string): Promise<number | null> {
  const forYouResponse = await fetch('https://wet3.click/api/for-you', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ startId: mediaId, limit: 1 }),
  })

  if (!forYouResponse.ok) {
    return null
  }

  const data = (await forYouResponse.json()) as { items?: ForYouItem[] }
  const item =
    data.items?.find((entry) => entry.id === mediaId) ?? data.items?.[0]

  if (!item?.streamUrl) {
    return null
  }

  const streamUrl = item.streamUrl.startsWith('http')
    ? item.streamUrl
    : `https://wet3.click${item.streamUrl}`

  return readPlaylistDuration(streamUrl)
}

export function createDurationMiddleware(): Connect.NextHandleFunction {
  return (req, res, next) => {
    const match = req.url?.match(/^\/(?:local-api|api)\/duration\/([^/?]+)/)

    if (!match) {
      next()
      return
    }

    const mediaId = decodeURIComponent(match[1])

    void fetchWet3VideoDuration(mediaId)
      .then((duration) => {
        res.setHeader('Content-Type', 'application/json')
        res.end(JSON.stringify({ duration }))
      })
      .catch(() => {
        res.statusCode = 500
        res.setHeader('Content-Type', 'application/json')
        res.end(JSON.stringify({ duration: null }))
      })
  }
}
