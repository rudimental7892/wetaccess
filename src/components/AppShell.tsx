import type { ReactNode } from 'react'

type AppShellProps = {
  children: ReactNode
  onHome?: () => void
  profileName?: string
}

export function AppShell({ children, onHome, profileName }: AppShellProps) {
  return (
    <div className="app">
      <header className="app-nav">
        <div className="app-nav-start">
          <a href="#/" className="app-brand" onClick={onHome}>
            <span className="app-brand-mark">WA</span>
            <span className="app-brand-text">wetaccess</span>
          </a>
          {profileName ? (
            <nav className="breadcrumb" aria-label="Breadcrumb">
              <span className="breadcrumb-sep">/</span>
              <span className="breadcrumb-current">@{profileName}</span>
            </nav>
          ) : null}
        </div>
        {profileName && onHome ? (
          <button type="button" className="nav-pill" onClick={onHome}>
            All creators
          </button>
        ) : (
          <span className="nav-tag">clone</span>
        )}
      </header>
      <main className="page">{children}</main>
    </div>
  )
}
