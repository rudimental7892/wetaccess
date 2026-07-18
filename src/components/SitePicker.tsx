import type { AppSite } from '../lib/session'

type SitePickerProps = {
  onPick: (site: AppSite) => void
  onLogout: () => void
}

export function SitePicker({ onPick, onLogout }: SitePickerProps) {
  return (
    <div className="gate">
      <div className="gate-card site-picker">
        <div className="gate-brand">
          <span className="gate-mark">WX</span>
          <div>
            <h1>Choose a site</h1>
            <p>Open a catalog after login</p>
          </div>
        </div>

        <div className="site-picker-grid">
          <button
            type="button"
            className="site-card"
            onClick={() => onPick('wetaccess')}
          >
            <span className="site-card-mark wa">WA</span>
            <span className="site-card-title">wetaccess</span>
            <span className="site-card-sub">
              wet3.click creators, profiles &amp; drops
            </span>
          </button>

          <button
            type="button"
            className="site-card"
            onClick={() => onPick('africancasting')}
          >
            <span className="site-card-mark ac">AC</span>
            <span className="site-card-title">African Casting</span>
            <span className="site-card-sub">
              Full public catalog + embed MP4 playback
            </span>
          </button>
        </div>

        <button type="button" className="gate-ghost" onClick={onLogout}>
          Sign out
        </button>
      </div>
    </div>
  )
}
