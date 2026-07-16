import { resolveDrop } from './_lib/dropsCore'

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

function queryString(value: string | string[] | undefined): string | undefined {
  return Array.isArray(value) ? value[0] : value
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
