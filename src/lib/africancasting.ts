export type CatalogVideo = {
  id: string
  title: string
  length: string
  keywords: string
  description: string
  channels: string
  models: string
  embed: string
  url: string
  main_thumb: string
}

export type CatalogResponse = {
  success: boolean
  total_results: number
  data: CatalogVideo[] | null
}

export type EmbedResponse = {
  id: string
  mp4: string
  poster: string | null
}

export function formatAcDuration(sec: string): string {
  const n = Number.parseInt(sec, 10)
  if (!Number.isFinite(n) || n <= 0) return sec
  const m = Math.floor(n / 60)
  const s = n % 60
  return m >= 60 ? `${Math.floor(m / 60)}h ${m % 60}m` : `${m}:${String(s).padStart(2, '0')}`
}

export function acThumbUrl(originalUrl: string): string {
  if (!originalUrl) return ''
  return `/api/ac-thumb?url=${encodeURIComponent(originalUrl)}`
}

export async function fetchAcCatalog(
  offset: number,
  amount: number,
): Promise<CatalogResponse> {
  const res = await fetch(`/api/ac-catalog?offset=${offset}&amount=${amount}`)
  if (!res.ok) {
    const body = (await res.json().catch(() => ({}))) as { error?: string }
    throw new Error(body.error ?? `Catalog HTTP ${res.status}`)
  }
  return (await res.json()) as CatalogResponse
}

export async function fetchAcEmbed(id: string): Promise<EmbedResponse> {
  let lastErr = 'Embed request failed'
  for (let attempt = 0; attempt < 3; attempt++) {
    try {
      const res = await fetch(`/api/ac-embed?id=${encodeURIComponent(id)}`)
      const body = (await res.json()) as EmbedResponse & { error?: string }
      if (!res.ok) throw new Error(body.error ?? `HTTP ${res.status}`)
      return body
    } catch (e) {
      lastErr = e instanceof Error ? e.message : String(e)
      if (attempt < 2) await new Promise((r) => setTimeout(r, 600 * (attempt + 1)))
    }
  }
  throw new Error(lastErr)
}
