import { type ReactNode, useEffect, useState } from 'react'

type AppShellProps = {
  children: ReactNode
  onHome?: () => void
  activeNav?: 'creators' | 'twitter' | 'drops'
  breadcrumb?: string
  backLabel?: string
  onBack?: () => void
  onSwitchSite?: () => void
  onLogout?: () => void
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
}: AppShellProps) {
  const [menuOpen, setMenuOpen] = useState(false)

  useEffect(() => {
    if (!menuOpen) return
    const onKey = (e: KeyboardEvent) => {
      if (e.key === 'Escape') setMenuOpen(false)
    }
    window.addEventListener('keydown', onKey)
    // Prevent body scroll while drawer open
    const prev = document.body.style.overflow
    document.body.style.overflow = 'hidden'
    return () => {
      window.removeEventListener('keydown', onKey)
      document.body.style.overflow = prev
    }
  }, [menuOpen])

  // Close drawer when hash/route changes
  useEffect(() => {
    const close = () => setMenuOpen(false)
    window.addEventListener('hashchange', close)
    return () => window.removeEventListener('hashchange', close)
  }, [])

  return (
    <div className="app">
      <header className="app-nav">
        <div className="app-nav-start">
          <a
            href="#/"
            className="app-brand"
            onClick={() => {
              setMenuOpen(false)
              onHome?.()
            }}
          >
            <span className="app-brand-mark">WA</span>
            <span className="app-brand-text">wetaccess</span>
          </a>
          <nav className="app-nav-tabs app-nav-tabs-desktop" aria-label="Primary">
            <a
              href="#/"
              className={`nav-tab${activeNav === 'creators' ? ' active' : ''}`}
              aria-current={activeNav === 'creators' ? 'page' : undefined}
            >
              Creators
            </a>
            <a
              href="#/twitter"
              className={`nav-tab${activeNav === 'twitter' ? ' active' : ''}`}
              aria-current={activeNav === 'twitter' ? 'page' : undefined}
            >
              Twitter
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
            <nav className="breadcrumb breadcrumb-desktop" aria-label="Breadcrumb">
              <span className="breadcrumb-sep">/</span>
              <span className="breadcrumb-current">{breadcrumb}</span>
            </nav>
          ) : null}
        </div>

        <div className="app-nav-actions app-nav-actions-desktop">
          {onBack && backLabel ? (
            <button type="button" className="nav-pill" onClick={onBack}>
              {backLabel}
            </button>
          ) : null}
          {onSwitchSite ? (
            <button type="button" className="nav-pill" onClick={onSwitchSite}>
              Switch site
            </button>
          ) : null}
          {onLogout ? (
            <button type="button" className="nav-pill" onClick={onLogout}>
              Sign out
            </button>
          ) : (
            <span className="nav-tag">clone</span>
          )}
        </div>

        <button
          type="button"
          className={`nav-hamburger${menuOpen ? ' open' : ''}`}
          aria-label={menuOpen ? 'Close menu' : 'Open menu'}
          aria-expanded={menuOpen}
          aria-controls="mobile-nav-drawer"
          onClick={() => setMenuOpen((v) => !v)}
        >
          <span className="nav-hamburger-bar" />
          <span className="nav-hamburger-bar" />
          <span className="nav-hamburger-bar" />
        </button>
      </header>

      {/* Mobile drawer */}
      <div
        className={`nav-drawer-backdrop${menuOpen ? ' open' : ''}`}
        aria-hidden={!menuOpen}
        onClick={() => setMenuOpen(false)}
      />
      <aside
        id="mobile-nav-drawer"
        className={`nav-drawer${menuOpen ? ' open' : ''}`}
        aria-hidden={!menuOpen}
      >
        <div className="nav-drawer-head">
          <span className="app-brand-mark">WA</span>
          <strong>Menu</strong>
          <button
            type="button"
            className="nav-drawer-close"
            aria-label="Close menu"
            onClick={() => setMenuOpen(false)}
          >
            ×
          </button>
        </div>

        {breadcrumb ? (
          <p className="nav-drawer-crumb">{breadcrumb}</p>
        ) : null}

        <nav className="nav-drawer-links" aria-label="Mobile primary">
          <a
            href="#/"
            className={`nav-drawer-link${activeNav === 'creators' ? ' active' : ''}`}
            onClick={() => setMenuOpen(false)}
          >
            Creators
          </a>
          <a
            href="#/twitter"
            className={`nav-drawer-link${activeNav === 'twitter' ? ' active' : ''}`}
            onClick={() => setMenuOpen(false)}
          >
            Twitter
          </a>
          <a
            href="#/drops"
            className={`nav-drawer-link${activeNav === 'drops' ? ' active' : ''}`}
            onClick={() => setMenuOpen(false)}
          >
            Drops
          </a>
        </nav>

        <div className="nav-drawer-actions">
          {onBack && backLabel ? (
            <button
              type="button"
              className="nav-drawer-btn"
              onClick={() => {
                setMenuOpen(false)
                onBack()
              }}
            >
              {backLabel}
            </button>
          ) : null}
          {onSwitchSite ? (
            <button
              type="button"
              className="nav-drawer-btn"
              onClick={() => {
                setMenuOpen(false)
                onSwitchSite()
              }}
            >
              Switch site
            </button>
          ) : null}
          {onLogout ? (
            <button
              type="button"
              className="nav-drawer-btn danger"
              onClick={() => {
                setMenuOpen(false)
                onLogout()
              }}
            >
              Sign out
            </button>
          ) : null}
        </div>
      </aside>

      <main className="page">{children}</main>
    </div>
  )
}
