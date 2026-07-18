export type AppSite = 'wetaccess' | 'africancasting'

export type SessionState = {
  loggedIn: boolean
  site: AppSite | null
}

const SESSION_KEY = 'wetaccess:session'

/** Demo gate for the multi-site shell. Change as needed. */
export const DEMO_CREDENTIALS = {
  username: 'access',
  password: 'access',
} as const

const DEFAULT_SESSION: SessionState = { loggedIn: false, site: null }

export function readSession(): SessionState {
  try {
    const raw = localStorage.getItem(SESSION_KEY)
    if (!raw) return { ...DEFAULT_SESSION }
    const parsed = JSON.parse(raw) as Partial<SessionState>
    return {
      loggedIn: Boolean(parsed.loggedIn),
      site:
        parsed.site === 'wetaccess' || parsed.site === 'africancasting'
          ? parsed.site
          : null,
    }
  } catch {
    return { ...DEFAULT_SESSION }
  }
}

export function writeSession(next: SessionState): void {
  localStorage.setItem(SESSION_KEY, JSON.stringify(next))
}

export function clearSession(): void {
  localStorage.removeItem(SESSION_KEY)
}

export function validateCredentials(username: string, password: string): boolean {
  return (
    username.trim().toLowerCase() === DEMO_CREDENTIALS.username &&
    password === DEMO_CREDENTIALS.password
  )
}
