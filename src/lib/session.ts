export type AppSite =
  | 'wetaccess'
  | 'africancasting'
  | 'fanbusy'
  | 'fantribe'
  | 'leakedzone'

export type SessionState = {
  loggedIn: boolean
  site: AppSite | null
}

const SESSION_KEY = 'wetaccess:session'

/** Gate for the multi-site shell. */
export const DEMO_CREDENTIALS = {
  username: 'admin',
  password: 'SuperAccess@Pass2026',
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
        parsed.site === 'wetaccess' ||
        parsed.site === 'africancasting' ||
        parsed.site === 'fanbusy' ||
        parsed.site === 'fantribe' ||
        parsed.site === 'leakedzone'
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
    username.trim().toLowerCase() === DEMO_CREDENTIALS.username.toLowerCase() &&
    password === DEMO_CREDENTIALS.password
  )
}
