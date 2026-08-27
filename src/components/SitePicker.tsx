import type { AppSite } from '../lib/session'

type SitePickerProps = {
  onPick: (site: AppSite) => void
  onLogout: () => void
}

export function SitePicker({ onPick, onLogout }: SitePickerProps) {
  return (
    <div className="min-h-svh grid place-items-center p-6">
      <div className="w-full max-w-[920px] p-7 border border-border rounded-xl bg-surface/90 shadow-lg grid gap-4">
        <div className="flex items-center gap-3.5">
          <span className="min-w-[42px] h-[42px] px-2.5 rounded-xl grid place-items-center font-display text-[13px] font-[800] text-white bg-gradient-to-br from-accent to-[#c4004a]">
            WX
          </span>
          <div>
            <h1 className="m-0 font-display text-[1.45rem] tracking-tight">Choose a site</h1>
            <p className="mt-0.5 m-0 text-muted text-[0.92rem]">Open a catalog after login</p>
          </div>
        </div>

        <div className="grid grid-cols-2 max-sm:grid-cols-1 gap-3">
          <button
            type="button"
            className="grid gap-2 justify-items-start text-left p-4.5 px-4 rounded-2xl border border-border bg-card cursor-pointer text-inherit hover:border-accent/35 hover:bg-card-hover transition-all"
            onClick={() => onPick('wetaccess')}
          >
            <span className="min-w-[42px] h-[42px] px-2.5 rounded-xl grid place-items-center font-display text-[13px] font-[800] text-white bg-gradient-to-br from-accent to-[#c4004a]">
              WA
            </span>
            <span className="font-display text-[1.1rem] font-bold">wetaccess</span>
            <span className="text-muted text-[0.88rem] leading-snug">
              wet3.click creators, profiles &amp; drops
            </span>
          </button>

          <button
            type="button"
            className="grid gap-2 justify-items-start text-left p-4.5 px-4 rounded-2xl border border-border bg-card cursor-pointer text-inherit hover:border-accent/35 hover:bg-card-hover transition-all"
            onClick={() => onPick('africancasting')}
          >
            <span className="site-card-mark ac min-w-[42px] h-[42px] px-2.5 rounded-xl grid place-items-center font-display text-[13px] font-[800] text-white bg-gradient-to-br from-[#ea580c] to-[#c2410c]">
              AC
            </span>
            <span className="font-display text-[1.1rem] font-bold">African Casting</span>
            <span className="text-muted text-[0.88rem] leading-snug">
              Full public catalog + embed MP4 playback
            </span>
          </button>

          <button
            type="button"
            className="grid gap-2 justify-items-start text-left p-4.5 px-4 rounded-2xl border border-border bg-card cursor-pointer text-inherit hover:border-accent/35 hover:bg-card-hover transition-all"
            onClick={() => onPick('fanbusy')}
          >
            <span className="site-card-mark fb min-w-[42px] h-[42px] px-2.5 rounded-xl grid place-items-center font-display text-[13px] font-[800] text-white bg-gradient-to-br from-[#0d9488] to-[#0f766e]">
              FB
            </span>
            <span className="font-display text-[1.1rem] font-bold">FanBusy</span>
            <span className="text-muted text-[0.88rem] leading-snug">
              Guest API POC -- users, PII, KYC, paid HLS
            </span>
          </button>

          <button
            type="button"
            className="grid gap-2 justify-items-start text-left p-4.5 px-4 rounded-2xl border border-border bg-card cursor-pointer text-inherit hover:border-accent/35 hover:bg-card-hover transition-all"
            onClick={() => onPick('fantribe')}
          >
            <span className="site-card-mark ft min-w-[42px] h-[42px] px-2.5 rounded-xl grid place-items-center font-display text-[13px] font-[800] text-white bg-gradient-to-br from-[#0f766e] to-[#134e4a] text-[#ecfdf5]">
              FT
            </span>
            <span className="font-display text-[1.1rem] font-bold">FanTribe</span>
            <span className="text-muted text-[0.88rem] leading-snug">
              Convex getAllPosts -- locked CDN/Stream + KYC
            </span>
          </button>

          <button
            type="button"
            className="grid gap-2 justify-items-start text-left p-4.5 px-4 rounded-2xl border border-border bg-card cursor-pointer text-inherit hover:border-accent/35 hover:bg-card-hover transition-all"
            onClick={() => onPick('leakedzone')}
          >
            <span className="site-card-mark lz min-w-[42px] h-[42px] px-2.5 rounded-xl grid place-items-center font-display text-[13px] font-[800] text-white bg-gradient-to-br from-[#7c3aed] to-[#5b21b6] text-[#f5f3ff]">
              LZ
            </span>
            <span className="font-display text-[1.1rem] font-bold">LeakedZone</span>
            <span className="text-muted text-[0.88rem] leading-snug">
              Guest HTML scrape -- photos CDN + JWPlayer HLS
            </span>
          </button>

          <button
            type="button"
            className="grid gap-2 justify-items-start text-left p-4.5 px-4 rounded-2xl border border-border bg-card cursor-pointer text-inherit hover:border-accent/35 hover:bg-card-hover transition-all"
            onClick={() => onPick('switcity')}
          >
            <span className="min-w-[42px] h-[42px] px-2.5 rounded-xl grid place-items-center font-display text-[13px] font-[800] text-white bg-gradient-to-br from-[#f59e0b] to-[#d97706]">
              SC
            </span>
            <span className="font-display text-[1.1rem] font-bold">SwitCity</span>
            <span className="text-muted text-[0.88rem] leading-snug">
              Health endpoint + SSR scrape -- NestJS/Next.js
            </span>
          </button>
        </div>

        <button
          type="button"
          className="border border-border rounded-xl p-2.5 px-3.5 bg-transparent text-muted cursor-pointer hover:text-foreground hover:border-border-strong transition-all"
          onClick={onLogout}
        >
          Sign out
        </button>
      </div>
    </div>
  )
}
