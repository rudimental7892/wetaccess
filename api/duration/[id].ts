import { fetchWet3VideoDuration } from '../../server/wet3Duration'

type VercelRequest = {
  query: {
    id?: string | string[]
  }
}

type VercelResponse = {
  status: (code: number) => VercelResponse
  json: (body: unknown) => void
  setHeader: (name: string, value: string) => void
  end: (body?: string) => void
}

export default async function handler(req: VercelRequest, res: VercelResponse) {
  const rawId = req.query.id
  const mediaId = Array.isArray(rawId) ? rawId[0] : rawId

  if (!mediaId) {
    res.status(400).json({ duration: null })
    return
  }

  try {
    const duration = await fetchWet3VideoDuration(mediaId)
    res.status(200).json({ duration })
  } catch {
    res.status(500).json({ duration: null })
  }
}
