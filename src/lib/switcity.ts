export type ScHealthCheck = {
  status: string
  checks: {
    database: {
      status: string
      probesTotal: number
      probesFailed: number
      latencyMs: number
      pool: { used: number; free: number; pendingAcquires: number }
    }
    cache: {
      status: string
      latencyMs: number
      metrics: {
        namespaces: Record<
          string,
          {
            hits: number
            misses: number
            errors: number
            loaderCalls: number
            loaderDurationTotalMs: number
            loaderDurationMaxMs: number
            hitRate: number
            loaderAvgMs: number
          }
        >
      }
    }
  }
}

export type ScCreator = {
  username: string
  displayName: string
  avatar: string | null
  bio: string
  verified: boolean
  subscriberCount: number
  postCount: number
  category: string
}

export async function fetchScHealth(): Promise<ScHealthCheck> {
  const res = await fetch('/api/sc?op=health')
  if (!res.ok) throw new Error(`Health check failed (${res.status})`)
  return res.json() as Promise<ScHealthCheck>
}

export async function fetchScDiscover(): Promise<{
  source: string
  creators: ScCreator[]
  raw: unknown
}> {
  const res = await fetch('/api/sc?op=discover')
  if (!res.ok) throw new Error(`Discover failed (${res.status})`)
  const body = (await res.json()) as { source: string; data: unknown }

  const creators = extractCreatorsFromSSR(body.data)
  return { source: body.source, creators, raw: body.data }
}

function extractCreatorsFromSSR(data: unknown): ScCreator[] {
  if (!data || typeof data !== 'object') return []

  const results: ScCreator[] = []
  const seen = new Set<string>()

  function walk(obj: unknown): void {
    if (!obj || typeof obj !== 'object') return
    if (Array.isArray(obj)) {
      for (const item of obj) walk(item)
      return
    }

    const record = obj as Record<string, unknown>

    if (
      typeof record.username === 'string' &&
      record.username.length > 0 &&
      !seen.has(record.username)
    ) {
      const hasCreatorFields =
        'displayName' in record ||
        'display_name' in record ||
        'bio' in record ||
        'avatar' in record ||
        'profileImage' in record ||
        'subscriberCount' in record ||
        'subscriber_count' in record

      if (hasCreatorFields) {
        seen.add(record.username)
        results.push({
          username: record.username,
          displayName:
            String(record.displayName ?? record.display_name ?? record.name ?? record.username),
          avatar: (record.avatar ?? record.profileImage ?? record.profile_image ?? null) as
            | string
            | null,
          bio: String(record.bio ?? record.about ?? ''),
          verified: Boolean(record.verified ?? record.isVerified ?? record.is_verified),
          subscriberCount: Number(
            record.subscriberCount ?? record.subscriber_count ?? record.subscribers ?? 0,
          ),
          postCount: Number(record.postCount ?? record.post_count ?? record.posts ?? 0),
          category: String(record.category ?? record.type ?? ''),
        })
      }
    }

    for (const value of Object.values(record)) {
      if (value && typeof value === 'object') walk(value)
    }
  }

  walk(data)
  return results
}

export function scAvatarPlaceholder(letter: string): string {
  const svg = `<svg xmlns="http://www.w3.org/2000/svg" width="120" height="120"><rect fill="#44403c" width="120" height="120" rx="24"/><text x="50%" y="54%" dominant-baseline="middle" text-anchor="middle" fill="#fbbf24" font-size="48" font-family="system-ui">${letter}</text></svg>`
  return `data:image/svg+xml,${encodeURIComponent(svg)}`
}
