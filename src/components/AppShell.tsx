import type { ReactNode } from 'react'

type AppShellProps = {
  children: ReactNode
  onHome?: () => void
  activeNav?: 'creators' | 'drops'
  breadcrumb?: string
  backLabel?: string
  onBack?: () => void
}

export function AppShell({
  children,
  onHome,
  activeNav = 'creators',
  breadcrumb,
  backLabel,
  onBack,
}: AppShellProps) {
  return (
    <div className="app">
      <header className="app-nav">
        <div className="app-nav-start">
          <a href="#/" className="app-brand" onClick={onHome}>
            <span className="app-brand-mark">WA</span>
            <span className="app-brand-text">wetaccess</span>
          </a>
          <nav className="app-nav-tabs" aria-label="Primary">
            <a
              href="#/"
              className={`nav-tab${activeNav === 'creators' ? ' active' : ''}`}
              aria-current={activeNav === 'creators' ? 'page' : undefined}
            >
              Creators
            </a>
            <a
              href="#/drops"
              className={`nav-tab${activeNav === 'drops' ? ' active' : ''}`}
              aria-current={activeNav === 'drops' ? 'page' : undefined}
            >
              Drops
            </a>
          </nav>
          {breadcrumb ? (
            <nav className="breadcrumb" aria-label="Breadcrumb">
              <span className="breadcrumb-sep">/</span>
              <span className="breadcrumb-current">{breadcrumb}</span>
            </nav>
          ) : null}
        </div>
        {onBack && backLabel ? (
          <button type="button" className="nav-pill" onClick={onBack}>
            {backLabel}
          </button>
        ) : (
          <span className="nav-tag">clone</span>
        )}
      </header>
      <main className="page">{children}</main>
    </div>
  )
}
