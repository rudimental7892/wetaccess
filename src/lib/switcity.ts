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

export type ScPageInfo = {
  status: number
  title: string
  excerpt: string
}

export async function fetchScPages(): Promise<Record<string, ScPageInfo>> {
  const res = await fetch('/api/sc?op=pages')
  if (!res.ok) throw new Error(`Pages scan failed (${res.status})`)
  return res.json() as Promise<Record<string, ScPageInfo>>
}

export async function fetchScEarnings(): Promise<{ status: number; text: string }> {
  const res = await fetch('/api/sc?op=earnings')
  if (!res.ok) throw new Error(`Earnings fetch failed (${res.status})`)
  return res.json() as Promise<{ status: number; text: string }>
}

export function scAvatarPlaceholder(letter: string): string {
  const svg = `<svg xmlns="http://www.w3.org/2000/svg" width="120" height="120"><rect fill="#44403c" width="120" height="120" rx="24"/><text x="50%" y="54%" dominant-baseline="middle" text-anchor="middle" fill="#fbbf24" font-size="48" font-family="system-ui">${letter}</text></svg>`
  return `data:image/svg+xml,${encodeURIComponent(svg)}`
}
