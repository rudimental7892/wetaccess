import { type ReactNode } from 'react'
import { ScrollToTop } from './ScrollToTop'

type AppShellProps = {
  children: ReactNode
  onHome?: () => void
  activeNav?: 'creators' | 'twitter' | 'drops' | 'favorites'
  breadcrumb?: string
  backLabel?: string
  onBack?: () => void
  onSwitchSite?: () => void
  onLogout?: () => void
  favCount?: number
}

function TabIcon({ name }: { name: 'creators' | 'twitter' | 'drops' | 'sites' | 'favorites' }) {
  const cls = "w-5 h-5"
  if (name === 'creators') {
    return (
      <svg className={cls} viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
        <path d="M17 21v-2a4 4 0 0 0-4-4H5a4 4 0 0 0-4 4v2" />
        <circle cx="9" cy="7" r="4" />
        <path d="M23 21v-2a4 4 0 0 0-3-3.87" />
        <path d="M16 3.13a4 4 0 0 1 0 7.75" />
      </svg>
    )
  }
  if (name === 'twitter') {
    return (
      <svg className={cls} viewBox="0 0 24 24" fill="currentColor">
        <path d="M18.244 2.25h3.308l-7.227 8.26 8.502 11.24H16.17l-5.214-6.817L4.99 21.75H1.68l7.73-8.835L1.254 2.25H8.08l4.713 6.231zm-1.161 17.52h1.833L7.084 4.126H5.117z" />
      </svg>
    )
  }
  if (name === 'drops') {
    return (
      <svg className={cls} viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
        <path d="M21 16V8a2 2 0 0 0-1-1.73l-7-4a2 2 0 0 0-2 0l-7 4A2 2 0 0 0 3 8v8a2 2 0 0 0 1 1.73l7 4a2 2 0 0 0 2 0l7-4A2 2 0 0 0 21 16z" />
        <polyline points="3.27 6.96 12 12.01 20.73 6.96" />
        <line x1="12" y1="22.08" x2="12" y2="12" />
      </svg>
    )
  }
  if (name === 'favorites') {
    return (
      <svg className={cls} viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
        <path d="M20.84 4.61a5.5 5.5 0 0 0-7.78 0L12 5.67l-1.06-1.06a5.5 5.5 0 0 0-7.78 7.78l1.06 1.06L12 21.23l7.78-7.78 1.06-1.06a5.5 5.5 0 0 0 0-7.78z" />
      </svg>
    )
  }
  // sites
  return (
    <svg className={cls} viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
      <rect x="3" y="3" width="7" height="7" rx="1" />
      <rect x="14" y="3" width="7" height="7" rx="1" />
      <rect x="3" y="14" width="7" height="7" rx="1" />
      <rect x="14" y="14" width="7" height="7" rx="1" />
    </svg>
  )
}

export function AppShell({
  children,
  onHome,
  activeNav = 'creators',
  breadcrumb,
  backLabel,
  onBack,
  onSwitchSite,
  onLogout,
  favCount = 0,
}: AppShellProps) {
  return (
    <div className="min-h-svh grid grid-rows-[auto_1fr]">
      {/* ---- Desktop top nav ---- */}
      <header className="sticky top-0 z-20 flex items-center justify-between gap-4 px-6 py-3.5 border-b border-border bg-base/82 backdrop-blur-xl backdrop-saturate-[1.4]">
        <div className="flex items-center gap-3 min-w-0">
          <a
            href="#/"
            className="inline-flex items-center gap-2.5 shrink-0"
            onClick={() => onHome?.()}
          >
            <span className="min-w-[34px] h-[34px] px-2 rounded-xl grid place-items-center font-display text-xs font-[900] text-white bg-gradient-to-br from-accent to-[#c4004a] shadow-[0_8px_24px_rgba(224,100,152,0.22)]">
              WA
            </span>
            <span className="hidden md:inline font-display text-[22px] font-[800] tracking-tight">
              wetaccess
            </span>
          </a>

          {/* Desktop nav tabs */}
          <nav
            className="hidden md:inline-flex gap-1.5 p-1.5 border border-border rounded-full bg-inset"
            aria-label="Primary"
          >
            {([
              ['#/', 'creators', 'Creators'],
              ['#/twitter', 'twitter', 'Twitter'],
              ['#/drops', 'drops', 'Drops'],
              ['#/favorites', 'favorites', favCount ? `Favs (${favCount})` : 'Favs'],
            ] as const).map(([href, key, label]) => (
              <a
                key={key}
                href={href}
                className={
                  activeNav === key
                    ? 'text-white bg-gradient-to-br from-accent to-[#c4004a] shadow-[0_8px_20px_rgba(224,100,152,0.22)] rounded-full px-4 py-2.5 text-[13px] font-semibold'
                    : 'text-muted rounded-full px-4 py-2.5 text-[13px] font-semibold hover:text-foreground hover:bg-white/[0.04] transition-all'
                }
                aria-current={activeNav === key ? 'page' : undefined}
              >
                {label}
              </a>
            ))}
          </nav>

          {/* Desktop breadcrumb */}
          {breadcrumb ? (
            <nav
              className="hidden md:flex items-center gap-2 min-w-0 text-muted text-sm"
              aria-label="Breadcrumb"
            >
              <span className="text-soft">/</span>
              <span className="overflow-hidden text-ellipsis whitespace-nowrap text-foreground font-medium">
                {breadcrumb}
              </span>
            </nav>
          ) : null}
        </div>

        {/* Desktop actions */}
        <div className="hidden md:flex flex-wrap items-center justify-end gap-2">
          {onBack && backLabel ? (
            <button
              type="button"
              className="border border-border rounded-full px-3.5 py-2 text-xs font-semibold tracking-wide uppercase bg-card hover:border-accent/35 hover:bg-accent-soft hover:text-white transition-all cursor-pointer"
              onClick={onBack}
            >
              {backLabel}
            </button>
          ) : null}
          {onSwitchSite ? (
            <button
              type="button"
              className="border border-border rounded-full px-3.5 py-2 text-xs font-semibold tracking-wide uppercase bg-card hover:border-accent/35 hover:bg-accent-soft hover:text-white transition-all cursor-pointer"
              onClick={onSwitchSite}
            >
              Switch site
            </button>
          ) : null}
          {onLogout ? (
            <button
              type="button"
              className="border border-border rounded-full px-3.5 py-2 text-xs font-semibold tracking-wide uppercase bg-card hover:border-accent/35 hover:bg-accent-soft hover:text-white transition-all cursor-pointer"
              onClick={onLogout}
            >
              Sign out
            </button>
          ) : null}
        </div>

        {/* Mobile: show breadcrumb inline if present */}
        {breadcrumb ? (
          <span className="md:hidden text-sm text-muted overflow-hidden text-ellipsis whitespace-nowrap">
            {breadcrumb}
          </span>
        ) : null}
      </header>

      {/* ---- Main content ---- */}
      <main className="w-full max-w-[1240px] mx-auto px-3.5 md:px-6 py-4 md:py-7 pb-24 md:pb-12">
        {children}
      </main>

      {/* ---- Mobile bottom tab bar ---- */}
      <nav
        className="md:hidden fixed bottom-0 left-0 right-0 z-20 flex items-stretch justify-around border-t border-border bg-base/92 backdrop-blur-xl pb-[env(safe-area-inset-bottom)]"
        aria-label="Mobile primary"
      >
        {([
          { href: '#/', key: 'creators' as const, icon: 'creators' as const, label: 'Creators' },
          { href: '#/twitter', key: 'twitter' as const, icon: 'twitter' as const, label: 'Twitter' },
          { href: '#/drops', key: 'drops' as const, icon: 'drops' as const, label: 'Drops' },
          { href: '#/favorites', key: 'favorites' as const, icon: 'favorites' as const, label: favCount ? `Favs (${favCount})` : 'Favs' },
        ]).map(({ href, key, icon, label }) => (
          <a
            key={key}
            href={href}
            className={`flex flex-col items-center justify-center gap-0.5 py-2.5 px-3 min-w-[60px] text-[10px] font-semibold transition-colors ${
              activeNav === key ? 'text-accent' : 'text-soft hover:text-foreground'
            }`}
            aria-current={activeNav === key ? 'page' : undefined}
          >
            <TabIcon name={icon} />
            {label}
          </a>
        ))}
        {onSwitchSite ? (
          <button
            type="button"
            className="flex flex-col items-center justify-center gap-0.5 py-2.5 px-3 min-w-[60px] text-[10px] font-semibold text-soft hover:text-foreground transition-colors cursor-pointer bg-transparent border-none"
            onClick={onSwitchSite}
          >
            <TabIcon name="sites" />
            Sites
          </button>
        ) : null}
      </nav>

      <ScrollToTop />
    </div>
  )
}
